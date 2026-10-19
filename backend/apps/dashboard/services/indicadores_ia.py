"""
Indicadores de matching e de maturidade (RF14 / PB74, PB75).

Separados de `indicadores_de` de proposito. O painel que abre com a sessao tem
orcamento de tres consultas (`core/tests/test_orcamento_de_queries.py`); estes
dois blocos leem cinco tabelas das fases 3.2/3.3 e respondem pergunta de
acompanhamento, nao de abertura de tela. Quem os pede e a aba de Indicadores,
depois de a pagina ja estar de pe.

**Sao do Supervisor.** As duas historias dizem "como Supervisor": a capacidade
da rede e a maturidade das propostas sao leitura interna de conducao, e o
recorte do PB71 mantem o Demandante fora disso.

Nenhum numero aqui e inventado: todos saem de coluna gravada pelas rodadas de
matching e de pre-analise. Onde nao houve rodada, o bloco responde zero **e diz
que nao houve rodada** - ausencia de dado e diferente de resultado zero.
"""
from __future__ import annotations

from typing import Any

from django.db.models import Avg, Count, Q

from apps.accounts.models import Usuario
from apps.competencies.models import CompetenciaNecessaria, NivelImportancia
from apps.copilot.models import Lacuna, TipoLacuna
from apps.matching.models import (
    EquipePotencial,
    ExecucaoMatching,
    LacunaCompetenciaEquipe,
    MembroEquipe,
    OrigemIndicacao,
)
from apps.maturity.models import (
    DimensaoMaturidade,
    NivelDimensao,
    PreAnalise,
    PreAnaliseDimensao,
    Recomendacao,
)
from apps.ai.models import StatusExecucao
from apps.maturity.services.preanalise import criterios_vigentes
from apps.network.models import Disponibilidade, MembroRede
from apps.opportunities.services.oportunidade import escopo_de


def _eixo(agregado: dict[str, Any], prefixo: str, choices) -> list[dict[str, Any]]:
    """
    Uma contagem por valor do enum, incluindo os zeros.

    Mesma regra do painel: valor sem ocorrencia que desaparece le-se como "nao
    existe" em vez de "ninguem esta nele".
    """
    return [
        {
            'valor': valor,
            'rotulo': rotulo,
            'total': agregado[f'{prefixo}_{indice}'] or 0,
        }
        for indice, (valor, rotulo) in enumerate(choices)
    ]


def _apelidos(prefixo: str, campo: str, choices) -> dict[str, Any]:
    return {
        f'{prefixo}_{indice}': Count('pk', filter=Q(**{campo: valor}))
        for indice, (valor, _rotulo) in enumerate(choices)
    }


def indicadores_de_matching(usuario: Usuario) -> dict[str, Any]:
    """
    O que o matching produziu e o quanto a rede cobre (PB74).

    O critério de aceite pede "a capacidade da rede interna de atender as
    competencias demandadas". Isso e a razao entre competencia necessaria e
    competencia que alguma equipe sugerida cobriu - as lacunas de equipe sao o
    complemento dela, e nao um numero solto.
    """
    oportunidades = escopo_de(usuario).values('pk')

    indicacoes = MembroEquipe.objects.filter(
        equipe__oportunidade__in=oportunidades
    ).aggregate(
        total=Count('pk'),
        sugeridas=Count('pk', filter=Q(origem=OrigemIndicacao.IA)),
        manuais=Count('pk', filter=Q(origem=OrigemIndicacao.MANUAL)),
        incluidas=Count('pk', filter=Q(incluido=True)),
        validadas=Count('pk', filter=Q(validada=True)),
        score_medio=Avg('score_compatibilidade', filter=Q(origem=OrigemIndicacao.IA)),
    )

    competencias = CompetenciaNecessaria.objects.filter(
        proposta__oportunidade__in=oportunidades
    ).aggregate(
        total=Count('pk'),
        essenciais=Count(
            'pk', filter=Q(nivel_importancia=NivelImportancia.ESSENCIAL)
        ),
        no_vocabulario=Count('pk', filter=Q(competencia__isnull=False)),
    )

    com_lacuna = (
        LacunaCompetenciaEquipe.objects.filter(
            equipe__oportunidade__in=oportunidades,
            competencia_necessaria__isnull=False,
        )
        .values('competencia_necessaria')
        .distinct()
        .count()
    )

    execucoes = ExecucaoMatching.objects.filter(
        oportunidade__in=oportunidades
    ).aggregate(
        total=Count('pk'),
        concluidas=Count('pk', filter=Q(status=StatusExecucao.OK)),
        com_rerank=Count('pk', filter=Q(usou_rerank=True)),
        com_fallback=Count('pk', filter=Q(fallback_usado=True)),
    )

    rede = MembroRede.objects.aggregate(
        total=Count('pk'),
        **_apelidos('disp', 'disponibilidade', Disponibilidade.choices),
    )

    demandadas = competencias['total'] or 0
    cobertas = max(demandadas - com_lacuna, 0)

    return {
        'houve_rodada': bool(execucoes['total']),
        'execucoes': execucoes['total'],
        'execucoes_concluidas': execucoes['concluidas'],
        'execucoes_com_rerank': execucoes['com_rerank'],
        'execucoes_sem_base_semantica': execucoes['com_fallback'],
        'equipes_geradas': EquipePotencial.objects.filter(
            oportunidade__in=oportunidades
        ).count(),
        'indicacoes': indicacoes['total'],
        'indicacoes_sugeridas': indicacoes['sugeridas'],
        'indicacoes_manuais': indicacoes['manuais'],
        'indicacoes_incluidas': indicacoes['incluidas'],
        'indicacoes_validadas': indicacoes['validadas'],
        'score_medio': (
            round(float(indicacoes['score_medio']), 4)
            if indicacoes['score_medio'] is not None
            else None
        ),
        'competencias_demandadas': demandadas,
        'competencias_essenciais': competencias['essenciais'] or 0,
        'competencias_no_vocabulario': competencias['no_vocabulario'] or 0,
        'competencias_cobertas': cobertas,
        'competencias_com_lacuna': com_lacuna,
        'cobertura_percentual': (
            round((cobertas / demandadas) * 100, 1) if demandadas else None
        ),
        'rede': {
            'total': rede['total'],
            'por_disponibilidade': _eixo(rede, 'disp', Disponibilidade.choices),
        },
    }


def indicadores_de_maturidade(usuario: Usuario) -> dict[str, Any]:
    """
    Como as propostas se comportam contra os critérios de referencia (PB75).

    O critério de aceite fala em "indicadores de maturidade"; o que o modelo
    tem de comparavel entre execucoes e o **nivel por dimensao** - jamais uma
    nota, que a baseline proibe (`CONTEXT.md` secao 4).
    """
    oportunidades = escopo_de(usuario).values('pk')

    analises = PreAnalise.objects.filter(
        proposta__oportunidade__in=oportunidades
    ).aggregate(
        total=Count('pk'),
        concluidas=Count('pk', filter=Q(status=StatusExecucao.OK)),
        com_erro=Count('pk', filter=Q(status=StatusExecucao.ERRO)),
        reavaliadas=Count('proposta', distinct=True),
    )

    dimensoes = PreAnaliseDimensao.objects.filter(
        pre_analise__proposta__oportunidade__in=oportunidades
    ).aggregate(
        total=Count('pk'),
        **_apelidos('nivel', 'nivel', NivelDimensao.choices),
        **_apelidos('dim', 'dimensao', DimensaoMaturidade.choices),
    )

    fragis = PreAnaliseDimensao.objects.filter(
        pre_analise__proposta__oportunidade__in=oportunidades,
        nivel=NivelDimensao.FRAGIL,
    ).aggregate(**_apelidos('dim', 'dimensao', DimensaoMaturidade.choices))

    lacunas = Lacuna.objects.filter(
        oportunidade__in=oportunidades, tipo=TipoLacuna.PRE_ANALISE
    ).aggregate(
        total=Count('pk'),
        abertas=Count('pk', filter=Q(resolvida=False)),
    )

    recomendacoes = Recomendacao.objects.filter(
        oportunidade__in=oportunidades
    ).aggregate(
        total=Count('pk'),
        acatadas=Count('pk', filter=Q(acatada=True)),
    )

    vigente = criterios_vigentes().first()

    return {
        'houve_execucao': bool(analises['total']),
        'execucoes': analises['total'],
        'execucoes_concluidas': analises['concluidas'],
        'execucoes_com_erro': analises['com_erro'],
        'propostas_analisadas': analises['reavaliadas'],
        'dimensoes_avaliadas': dimensoes['total'],
        'por_nivel': _eixo(dimensoes, 'nivel', NivelDimensao.choices),
        'por_dimensao': _eixo(dimensoes, 'dim', DimensaoMaturidade.choices),
        'frageis_por_dimensao': _eixo(fragis, 'dim', DimensaoMaturidade.choices),
        'lacunas': lacunas['total'],
        'lacunas_abertas': lacunas['abertas'],
        'recomendacoes': recomendacoes['total'],
        'recomendacoes_acatadas': recomendacoes['acatadas'],
        'versao_criterios': vigente.versao if vigente is not None else None,
    }


def indicadores_de_ia(usuario: Usuario) -> dict[str, Any]:
    """Os dois blocos, numa leitura so - e um `GET` so para a tela."""
    return {
        'matching': indicadores_de_matching(usuario),
        'maturidade': indicadores_de_maturidade(usuario),
    }
