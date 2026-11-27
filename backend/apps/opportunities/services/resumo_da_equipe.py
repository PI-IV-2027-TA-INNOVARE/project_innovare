"""
O resumo da Equipe Potencial que a fila de oportunidades mostra por linha.

A fila nao abre a equipe: precisa so do estado do matching, de quantas pessoas
a equipe tem e de quantas lacunas sobraram - sempre da ultima equipe gerada,
como `equipe_atual_de`. "Pessoas" sao as que continuam na composicao
(`incluido`): tirar alguem nao apaga a indicacao, mas tira da equipe.
"""
from __future__ import annotations

from typing import TypedDict

from django.db.models import (
    Count,
    Exists,
    IntegerField,
    OuterRef,
    QuerySet,
    Subquery,
    TextChoices,
)
from django.db.models.functions import Coalesce

from apps.competencies.models import CompetenciaNecessaria
from apps.matching.models import EquipePotencial, LacunaCompetenciaEquipe, MembroEquipe
from apps.opportunities.models import Oportunidade


class EstadoDaEquipe(TextChoices):
    AGUARDANDO_COMPETENCIAS = 'aguardando_competencias', 'Aguardando competências'
    NAO_EXECUTADO = 'nao_executado', 'Matching não executado'
    SEM_RESULTADO = 'sem_resultado', 'Nenhum perfil encontrado'
    COM_EQUIPE = 'com_equipe', 'Com equipe potencial'


class ResumoDaEquipe(TypedDict):
    estado: str
    membros: int
    lacunas: int


def _equipe_atual(oportunidade_ref) -> QuerySet[EquipePotencial]:
    return EquipePotencial.objects.filter(oportunidade=oportunidade_ref).order_by(
        '-data_geracao', '-id_equipe'
    )


def _contagem(queryset: QuerySet, agrupada_por: str) -> Coalesce:
    total = (
        queryset.order_by()
        .values(agrupada_por)
        .annotate(total=Count('pk'))
        .values('total')[:1]
    )
    return Coalesce(Subquery(total, output_field=IntegerField()), 0)


def anotacoes_do_resumo() -> dict:
    """
    Tudo correlacionado so a `pk`, cada contagem achando a ultima equipe por
    conta propria: a fila ja tem `GROUP BY` (a contagem de anexos), e uma
    subconsulta que apontasse para outra anotacao entraria no agrupamento.
    """
    ultima = Subquery(_equipe_atual(OuterRef(OuterRef('pk'))).values('id_equipe')[:1])

    return {
        'resumo_tem_equipe': Exists(_equipe_atual(OuterRef('pk'))),
        'resumo_membros': _contagem(
            MembroEquipe.objects.filter(equipe=ultima, incluido=True), 'equipe'
        ),
        'resumo_lacunas': _contagem(
            LacunaCompetenciaEquipe.objects.filter(equipe=ultima), 'equipe'
        ),
        'resumo_competencias': _contagem(
            CompetenciaNecessaria.objects.filter(proposta__oportunidade=OuterRef('pk')),
            'proposta',
        ),
    }


def estado_da_equipe(*, tem_equipe: bool, membros: int, competencias: int) -> str:
    if tem_equipe:
        return EstadoDaEquipe.COM_EQUIPE if membros > 0 else EstadoDaEquipe.SEM_RESULTADO

    if competencias > 0:
        return EstadoDaEquipe.NAO_EXECUTADO

    return EstadoDaEquipe.AGUARDANDO_COMPETENCIAS


def resumo_da_equipe(oportunidade: Oportunidade) -> ResumoDaEquipe:
    """
    Le o que `fila_de` anotou; conta sozinho quando o objeto nao passou por
    ela - o mesmo acordo de `total_anexos`.
    """
    if not hasattr(oportunidade, 'resumo_tem_equipe'):
        valores = (
            Oportunidade.objects.filter(pk=oportunidade.pk)
            .annotate(**anotacoes_do_resumo())
            .values('resumo_tem_equipe', 'resumo_membros', 'resumo_lacunas', 'resumo_competencias')
            .get()
        )
    else:
        valores = {
            'resumo_tem_equipe': oportunidade.resumo_tem_equipe,
            'resumo_membros': oportunidade.resumo_membros,
            'resumo_lacunas': oportunidade.resumo_lacunas,
            'resumo_competencias': oportunidade.resumo_competencias,
        }

    return {
        'estado': estado_da_equipe(
            tem_equipe=valores['resumo_tem_equipe'],
            membros=valores['resumo_membros'],
            competencias=valores['resumo_competencias'],
        ),
        'membros': valores['resumo_membros'],
        'lacunas': valores['resumo_lacunas'],
    }
