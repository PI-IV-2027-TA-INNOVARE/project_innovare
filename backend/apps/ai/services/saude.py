"""
Saude da plataforma e consumo de IA (plano 5.2 e 5.3).

**A lista do que a tela acompanha nao e nossa.** Ela sai de
`docs/Engenharia_IA/Metodos_Integracao_IA.md`, secao Observabilidade:
"Acompanhar latencia, erros, tokens, custo, tamanho do contexto, modelo, versao
de prompt e avaliacao humana". Os oito estao aqui, nessa ordem de intencao - e
nada alem deles no bloco de IA.

Fora do bloco de IA ficam apenas dois numeros, cada um amarrado a um critério
da baseline que ninguem verifica por opiniao:

- **desempenho da API**, contra os **3 s** de `CONTEXT.md` secao 6 e o
  requisito nao funcional do TAP ("desempenho adequado nas operacoes
  convencionais"). O tamanho da amostra acompanha os percentis: p90 de tres
  requisicoes nao e p90.
- **fila assincrona**, que `Metodos_Integracao_IA.md` preve como pipeline de
  ingestao, embedding e pre-analise longa.

O que **saiu** na poda de 16/10/2026: uptime do processo, ambiente, motor do
banco, conexao reaproveitada e erros de servidor. Eram diagnostico barato
herdado do plano 5.2, sem pedido em documento de baseline, e competiam com o
consumo pela atencao de quem abre a tela (plano 5.3). O estado do banco ficou,
reduzido a responde/falha: ele e o unico que diz "a propria leitura desta
pagina pode estar mentindo".

Duas regras de construcao seguem valendo:

- **Falha de leitura nao derruba a pagina.** Cada bloco e montado em isolamento
  e devolve o proprio erro.
- **Numero que nao existe nao e preenchido com zero.** Sem fila configurada, a
  tela diz que nao ha fila; sem custo apurado, diz que nao ha apuracao.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from django.conf import settings
from django.db import connection
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from apps.ai.models import ExecucaoIA, StatusExecucao
from apps.ai.services.custo import precos
from core.medicao import medidor, percentil

MOTIVO_SEM_FILA = (
    'Fila assíncrona não configurada neste ambiente: nenhum worker publica '
    'execução aqui.'
)


def inicio_do_mes(agora: datetime | None = None) -> datetime:
    """
    O comeco do mes corrente, no fuso da aplicacao.

    O teto de custo e mensal: a janela tem de ser o mes de calendario, nao
    "ultimos 30 dias", ou o numero nunca casa com a fatura.
    """
    referencia = timezone.localtime(agora or timezone.now())

    return referencia.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _desempenho() -> dict[str, Any]:
    """
    Latencia da API contra os 3 s - o critério de aceitacao da baseline.

    Fica fora do bloco de IA de proposito: a latencia que a secao
    Observabilidade pede e a do provedor, e esta e a da operacao convencional.
    """
    resumo = medidor().resumo(limite_ms=int(settings.DESEMPENHO_LIMITE_MS))

    return {
        'amostras': resumo['amostras'],
        'p50_ms': resumo['p50_ms'],
        'p90_ms': resumo['p90_ms'],
        'limite_ms': resumo['limite_ms'],
        'acima_do_limite': resumo['acima_do_limite'],
    }


def _revisao_humana() -> dict[str, Any]:
    """
    A "avaliacao humana" que a secao Observabilidade nomeia.

    Nao e pesquisa de satisfacao: e quanto da saida de IA passou por gente.
    Sai de coluna gravada - `revisada_por_humano` na proposta, `validada` na
    indicacao, `acatada` na recomendacao -, e e o unico numero da pagina que
    responde "o circuito de revisao esta acontecendo?" (AGENTS.md 0.2).
    """
    from apps.copilot.models import PropostaEstruturada
    from apps.matching.models import EquipePotencial, MembroEquipe
    from apps.maturity.models import Recomendacao

    propostas = PropostaEstruturada.objects.exclude(execucao_ia__isnull=True).aggregate(
        total=Count('pk'), revisadas=Count('pk', filter=Q(revisada_por_humano=True))
    )
    indicacoes = MembroEquipe.objects.aggregate(
        total=Count('pk'), validadas=Count('pk', filter=Q(validada=True))
    )
    recomendacoes = Recomendacao.objects.aggregate(
        total=Count('pk'), acatadas=Count('pk', filter=Q(acatada=True))
    )

    return {
        'propostas_de_ia': propostas['total'],
        'propostas_revisadas': propostas['revisadas'],
        'indicacoes': indicacoes['total'],
        'indicacoes_validadas': indicacoes['validadas'],
        'equipes_geradas': EquipePotencial.objects.count(),
        'recomendacoes': recomendacoes['total'],
        'recomendacoes_acatadas': recomendacoes['acatadas'],
    }


def _consumo_de_ia() -> dict[str, Any]:
    desde = inicio_do_mes()
    execucoes = ExecucaoIA.objects.filter(criado_em__gte=desde)

    totais = execucoes.aggregate(
        chamadas=Count('id_execucao_ia'),
        custo=Sum('custo_estimado'),
        soma_entrada=Sum('tokens_entrada'),
        soma_saida=Sum('tokens_saida'),
        contexto_medio=Avg('tokens_entrada'),
        erros=Count('pk', filter=Q(status=StatusExecucao.ERRO)),
        fallbacks=Count('pk', filter=Q(fallback_usado=True)),
    )

    latencias = [
        valor
        for valor in execucoes.exclude(latencia_ms__isnull=True).values_list(
            'latencia_ms', flat=True
        )
    ]

    custo = float(totais['custo'] or 0)
    preco_entrada, preco_saida = precos()
    teto = float(settings.AI_CUSTO_TETO_MENSAL_BRL)
    ultima = ExecucaoIA.objects.order_by('-criado_em').first()
    chamadas = totais['chamadas'] or 0
    custo_apurado = execucoes.exclude(custo_estimado__isnull=True).exists()
    percentual = (custo / teto) * 100 if teto else None
    alerta = int(settings.AI_CUSTO_ALERTA_PERCENTUAL)

    return {
        'janela_desde': desde,
        'houve_execucao': bool(chamadas),
        'custo_apurado': custo_apurado,
        'estado': _estado_do_consumo(
            chamadas=chamadas,
            custo_apurado=custo_apurado,
            percentual=percentual,
            alerta=alerta,
        ),
        'percentual_de_alerta': alerta,
        'chamadas': chamadas,
        'por_tipo': {
            linha['tipo']: linha['quantas']
            for linha in execucoes.values('tipo').annotate(
                quantas=Count('id_execucao_ia')
            )
        },
        'custo_por_tipo': {
            linha['tipo']: round(float(linha['custo']), 4)
            for linha in execucoes.exclude(custo_estimado__isnull=True)
            .values('tipo')
            .annotate(custo=Sum('custo_estimado'))
        },
        'erros': totais['erros'],
        'fallbacks': totais['fallbacks'],
        'tokens_entrada': totais['soma_entrada'] or 0,
        'tokens_saida': totais['soma_saida'] or 0,
        'contexto_medio_tokens': (
            round(float(totais['contexto_medio']))
            if totais['contexto_medio'] is not None
            else None
        ),
        'custo_estimado_brl': round(custo, 4),
        'preco_entrada_brl_por_milhao': preco_entrada,
        'preco_saida_brl_por_milhao': preco_saida,
        'teto_mensal_brl': teto,
        'percentual_do_teto': round(percentual, 2) if percentual is not None else None,
        'saldo_brl': round(max(teto - custo, 0), 4) if teto else None,
        'p50_ms': percentil(latencias, 0.50),
        'p90_ms': percentil(latencias, 0.90),
        'provedor_configurado': bool(settings.GEMINI_API_KEY),
        'rerank_habilitado': bool(settings.AI_MATCH_RERANK_ENABLED),
        'modelo': settings.AI_MATCH_GEMINI_MODEL,
        'revisao_humana': _revisao_humana(),
        'ultima_execucao': (
            {
                'id': str(ultima.id_execucao_ia),
                'tipo': ultima.tipo,
                'status': ultima.status,
                'versao_prompt': ultima.versao_prompt,
                'criado_em': ultima.criado_em,
                'fallback_usado': ultima.fallback_usado,
                'erro': ultima.erro[:200],
            }
            if ultima is not None
            else None
        ),
    }


def _estado_do_consumo(
    *,
    chamadas: int,
    custo_apurado: bool,
    percentual: float | None,
    alerta: int,
) -> str:
    """
    O estado que a tela pinta - e a diferenca entre ausencia e zero.

    `sem_execucao` nao e `normal` com 0%: nada rodou no mes. `sem_apuracao` e o
    caso de hoje - houve chamada, e nenhuma gravou `custo_estimado`, porque
    nenhum codigo calcula custo ainda (P26). Apresentar os dois como "R$ 0,00
    de R$ 50,00" afirmaria um gasto confirmado que ninguem mediu.
    """
    if not chamadas:
        return 'sem_execucao'

    if not custo_apurado or percentual is None:
        return 'sem_apuracao'

    if percentual >= 100:
        return 'excedido'

    return 'atencao' if percentual >= alerta else 'normal'


def _jobs() -> dict[str, Any]:
    """
    A fila, e se a ausencia dela e problema.

    `esperada` separa "nao ha fila configurada neste ambiente" de "havia fila
    configurada e ela nao responde". Sem essa distincao, a tela alertaria sobre
    uma infraestrutura que o projeto deliberadamente nao tem.
    """
    configurado = bool(getattr(settings, 'CELERY_BROKER_URL', ''))

    return {
        'configurado': configurado,
        'esperada': configurado,
        'motivo': '' if configurado else MOTIVO_SEM_FILA,
    }


def _banco() -> dict[str, Any]:
    """
    Se o banco responde. Nada mais.

    Motor, uptime e reaproveitamento de conexao sairam na poda: nenhum
    documento os pede, e nenhum deles muda a leitura do consumo. O estado da
    conexao fica porque e ele que diz se o resto desta pagina pode ser lido.
    """
    estado = {'responde': True, 'erro': ''}

    try:
        connection.ensure_connection()
    except Exception as erro:
        estado['responde'] = False
        estado['erro'] = str(erro)[:200]

    return estado


def saude_da_plataforma() -> dict[str, Any]:
    """Os blocos da tela, cada um montado em isolamento."""
    blocos: dict[str, Any] = {}

    for nome, montador in (
        ('desempenho', _desempenho),
        ('ia', _consumo_de_ia),
        ('jobs', _jobs),
        ('banco', _banco),
    ):
        try:
            blocos[nome] = montador()
            blocos[f'{nome}_erro'] = ''
        except Exception as erro:
            blocos[nome] = None
            blocos[f'{nome}_erro'] = str(erro)[:200]

    return blocos
