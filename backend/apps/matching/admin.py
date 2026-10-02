"""
Admin do matching e da equipe potencial - somente leitura.

RN-A06 / D07: o matching sugere, nunca convoca. A tabela nao tem coluna de
aceite justamente para que nao haja onde gravar um - e o admin nao e a brecha
por onde ela voltaria.
"""
from django.contrib import admin

from apps.matching.models import (
    EquipePotencial,
    ExecucaoMatching,
    LacunaCompetenciaEquipe,
    MembroEquipe,
)
from core.admin import AdminSomenteLeitura


@admin.register(ExecucaoMatching)
class ExecucaoMatchingAdmin(AdminSomenteLeitura):
    list_display = [
        'id_execucao',
        'oportunidade',
        'estrategia',
        'status',
        'usou_rerank',
        'iniciado_em',
    ]
    list_filter = ['status', 'estrategia', 'usou_rerank', 'fallback_usado']
    search_fields = ['oportunidade__codigo', 'versao_modelo']
    date_hierarchy = 'iniciado_em'


@admin.register(EquipePotencial)
class EquipePotencialAdmin(AdminSomenteLeitura):
    list_display = ['id_equipe', 'oportunidade', 'execucao', 'data_geracao']
    search_fields = ['oportunidade__codigo']
    date_hierarchy = 'data_geracao'


@admin.register(MembroEquipe)
class MembroEquipeAdmin(AdminSomenteLeitura):
    list_display = [
        'equipe',
        'membro',
        'papel',
        'score_compatibilidade',
        'incluido',
        'origem',
        'validada',
    ]
    list_filter = ['papel', 'origem', 'incluido', 'validada']
    search_fields = ['equipe__oportunidade__codigo', 'membro__nome']


@admin.register(LacunaCompetenciaEquipe)
class LacunaCompetenciaEquipeAdmin(AdminSomenteLeitura):
    list_display = ['equipe', 'competencia_necessaria', 'criado_em']
    search_fields = ['descricao', 'equipe__oportunidade__codigo']
