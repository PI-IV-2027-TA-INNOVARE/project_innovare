"""
Admin das execucoes de IA - somente leitura.

E a tabela que responde quanto o mes ja consumiu contra
`AI_CUSTO_TETO_MENSAL_BRL`. Editar custo ou status por aqui falsearia o teto.
"""
from django.contrib import admin

from apps.ai.models import ExecucaoIA
from core.admin import AdminSomenteLeitura


@admin.register(ExecucaoIA)
class ExecucaoIAAdmin(AdminSomenteLeitura):
    list_display = [
        'tipo',
        'provedor',
        'modelo',
        'status',
        'custo_estimado',
        'latencia_ms',
        'criado_em',
    ]
    list_filter = ['tipo', 'status', 'provedor', 'fallback_usado']
    search_fields = ['modelo', 'executado_por', 'correlation_id']
    date_hierarchy = 'criado_em'
