"""
Admin do matching e da equipe potencial - somente leitura.

RN-A06 / D07: o matching sugere, nunca convoca. A tabela nao tem coluna de
aceite justamente para que nao haja onde gravar um - e o admin nao e a brecha
por onde ela voltaria.
"""
from django.contrib import admin

from apps.matching.models import EquipePotencial, ExecucaoMatching
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
    list_display = [
        'oportunidade',
        'membro',
        'papel_sugerido',
        'score_match',
        'origem',
        'validada',
    ]
    list_filter = ['papel_sugerido', 'origem', 'validada']
    search_fields = ['oportunidade__codigo', 'membro__nome']
