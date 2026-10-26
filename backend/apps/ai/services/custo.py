"""
Apuracao de custo das chamadas de IA e o teto mensal de gasto.

**A regra nao e nossa.** `docs/Engenharia_IA/Plano_Integracao_IA.md`, secao
Controle de custo, da a formula:

    custo da chamada = (tokens de entrada / 1.000.000 * preco de entrada)
                     + (tokens de saida / 1.000.000 * preco de saida)

e lista "custo e latencia ficam visiveis para a equipe" entre os criterios de
aceite. `Metodos_Integracao_IA.md`, na tabela de falhas, define o estouro:
"Custo acima do limite -> Interromper requisicao e registrar alerta".

**O preco e configuracao, e nasce sem valor.** Tabela de provedor muda sem
avisar o repositorio, e numero magico em codigo vira fatura errada
(AGENTS.md 2.4). Enquanto `AI_CUSTO_*_BRL_POR_MILHAO` estiver em zero, a
apuracao devolve `None` - "ninguem mediu" - e nao R$ 0,00, que afirmaria um
gasto conferido. A tela ja sabe pintar essa diferenca (`sem_apuracao`).
"""
from __future__ import annotations

from django.conf import settings
from django.db.models import Sum

from core.exceptions import ErroDeDominio

POR_MILHAO = 1_000_000


class TetoDeCustoExcedido(ErroDeDominio):
    """O mes bateu no teto configurado. A chamada ao provedor nao sai."""


MOTIVO_SEM_IA = 'ia_indisponivel'
MOTIVO_FALHA_DO_PROVEDOR = 'falha_do_provedor'
MOTIVO_LIMITE_DA_OPORTUNIDADE = 'limite_da_oportunidade'
MOTIVO_LIMITE_DO_MES = 'limite_do_mes'

MOTIVO_DO_ESTOURO = {
    'teto_por_oportunidade_excedido': MOTIVO_LIMITE_DA_OPORTUNIDADE,
    'teto_de_custo_excedido': MOTIVO_LIMITE_DO_MES,
}

EXPLICACAO_DO_MOTIVO = {
    MOTIVO_SEM_IA: 'o serviço de IA está indisponível',
    MOTIVO_FALHA_DO_PROVEDOR: 'o serviço de IA não respondeu',
    MOTIVO_LIMITE_DA_OPORTUNIDADE: (
        'esta oportunidade atingiu o limite de gasto com IA. Quem administra '
        'a plataforma pode rever o limite'
    ),
    MOTIVO_LIMITE_DO_MES: (
        'o limite mensal de gasto com IA foi atingido. A IA volta no próximo '
        'mês ou quando o limite for aumentado'
    ),
}


def explicar_motivo(motivo: str | None) -> str:
    """Por que a IA nao foi chamada, em linguagem de tela."""
    return EXPLICACAO_DO_MOTIVO.get(motivo or MOTIVO_SEM_IA, EXPLICACAO_DO_MOTIVO[MOTIVO_SEM_IA])


def precos() -> tuple[float, float]:
    """Os precos vigentes por milhao de tokens, entrada e saida."""
    return (
        float(getattr(settings, 'AI_CUSTO_ENTRADA_BRL_POR_MILHAO', 0) or 0),
        float(getattr(settings, 'AI_CUSTO_SAIDA_BRL_POR_MILHAO', 0) or 0),
    )


def ha_tabela_de_preco() -> bool:
    return any(preco > 0 for preco in precos())


def custo_da_chamada(
    *, tokens_entrada: int | None, tokens_saida: int | None
) -> float | None:
    """
    O custo de uma chamada, ou `None` quando nao da para apurar.

    Nao apura quando nenhum lado foi medido ou quando nao ha tabela de preco:
    nos dois casos, zero seria uma afirmacao sobre dinheiro que ninguem fez.
    """
    if tokens_entrada is None and tokens_saida is None:
        return None

    if not ha_tabela_de_preco():
        return None

    preco_entrada, preco_saida = precos()

    return (
        (tokens_entrada or 0) / POR_MILHAO * preco_entrada
        + (tokens_saida or 0) / POR_MILHAO * preco_saida
    )


def custo_do_mes() -> float:
    """O que o mes corrente ja custou, somado do que foi apurado."""
    from apps.ai.models import ExecucaoIA
    from apps.ai.services.saude import inicio_do_mes

    total = ExecucaoIA.objects.filter(criado_em__gte=inicio_do_mes()).aggregate(
        custo=Sum('custo_estimado')
    )['custo']

    return float(total or 0)


def custo_da_oportunidade(oportunidade_id: int) -> float:
    """O que uma oportunidade ja custou, somado de todas as suas execucoes."""
    from apps.ai.models import ExecucaoIA

    total = ExecucaoIA.objects.filter(oportunidade_id=oportunidade_id).aggregate(
        custo=Sum('custo_estimado')
    )['custo']

    return float(total or 0)


def garantir_orcamento(oportunidade_id: int | None = None) -> None:
    """
    O hard stop do plano de integracao: o teto do mes e o da oportunidade.

    Teto em zero e "sem teto configurado", nao "tudo proibido": bloquear o
    projeto inteiro por falta de configuracao seria pior que o gasto que o
    bloqueio evita.

    O limite por oportunidade soma todas as execucoes dela, sem recorte de
    mes: e o que impede uma oportunidade sozinha de consumir o orcamento.
    """
    if oportunidade_id is not None:
        _garantir_teto_da_oportunidade(oportunidade_id)

    teto = float(getattr(settings, 'AI_CUSTO_TETO_MENSAL_BRL', 0) or 0)

    if teto <= 0:
        return

    gasto = custo_do_mes()

    if gasto < teto:
        return

    _alertar(gasto=gasto, teto=teto)

    raise TetoDeCustoExcedido(
        f'O teto mensal de IA (R$ {teto:.2f}) foi atingido: '
        f'R$ {gasto:.2f} apurados neste mes.',
        codigo='teto_de_custo_excedido',
    )


def _garantir_teto_da_oportunidade(oportunidade_id: int) -> None:
    from apps.audit.models import CategoriaEvento, StatusEvento
    from apps.audit.services import registrar_evento
    from apps.opportunities.models import Oportunidade

    teto = float(getattr(settings, 'AI_CUSTO_TETO_POR_OPORTUNIDADE_BRL', 0) or 0)

    if teto <= 0:
        return

    gasto = custo_da_oportunidade(oportunidade_id)

    if gasto < teto:
        return

    registrar_evento(
        categoria=CategoriaEvento.CONFIG,
        tipo='teto_por_oportunidade_excedido',
        entidade='ia',
        entidade_id=oportunidade_id,
        status=StatusEvento.NEGADO,
        motivo=f'Gasto apurado R$ {gasto:.2f} contra limite de R$ {teto:.2f}.',
        detalhe={'gasto_brl': round(gasto, 4), 'teto_brl': round(teto, 4)},
        oportunidade=Oportunidade.objects.filter(pk=oportunidade_id).first(),
    )

    raise TetoDeCustoExcedido(
        f'O limite de IA por oportunidade (R$ {teto:.2f}) foi atingido: '
        f'R$ {gasto:.2f} apurados nesta oportunidade.',
        codigo='teto_por_oportunidade_excedido',
    )


def _alertar(*, gasto: float, teto: float) -> None:
    from apps.audit.models import CategoriaEvento, StatusEvento
    from apps.audit.services import registrar_evento

    registrar_evento(
        categoria=CategoriaEvento.CONFIG,
        tipo='teto_de_custo_excedido',
        entidade='ia',
        entidade_id='custo_mensal',
        status=StatusEvento.NEGADO,
        motivo=f'Gasto apurado R$ {gasto:.2f} contra teto de R$ {teto:.2f}.',
        detalhe={'gasto_brl': round(gasto, 4), 'teto_brl': round(teto, 4)},
    )
