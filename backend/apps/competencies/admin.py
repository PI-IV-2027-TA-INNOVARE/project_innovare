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
        'oportunidade',
        'competencia',
        'essencial',
        'derivada_de',
        'atualizado_em',
    ]
    list_filter = ['essencial', 'derivada_de']
    search_fields = ['descricao', 'oportunidade__codigo']
