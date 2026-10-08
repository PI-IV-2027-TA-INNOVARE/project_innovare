"""
Admin das competencias necessarias - somente leitura.

Cada linha carrega a proveniencia (`derivada_de`, `execucao_ia`). Inserir a mao
produziria competencia sem origem rastreavel, e e sobre ela que o matching
pontua.
"""
from django.contrib import admin

from apps.competencies.models import CompetenciaNecessaria
from core.admin import AdminSomenteLeitura


@admin.register(CompetenciaNecessaria)
class CompetenciaNecessariaAdmin(AdminSomenteLeitura):
    list_display = [
        'descricao',
        'proposta',
        'competencia',
        'nivel_importancia',
        'derivada_de',
        'atualizado_em',
    ]
    list_filter = ['nivel_importancia', 'derivada_de']
    search_fields = ['descricao', 'proposta__oportunidade__codigo']
