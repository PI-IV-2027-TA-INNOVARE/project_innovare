"""
Admin da trilha de auditoria - somente leitura, sem excecao.

O evento e append-only (RF12): nunca atualizado, nunca apagado. Uma trilha que
o operador consegue editar nao serve de trilha, e e ela que responde "quem
mudou o que, quando e por que" quando alguem perguntar.
"""
from django.contrib import admin

from apps.audit.models import EventoAuditoria
from core.admin import AdminSomenteLeitura


@admin.register(EventoAuditoria)
class EventoAuditoriaAdmin(AdminSomenteLeitura):
    list_display = [
        'ocorrido_em',
        'categoria',
        'tipo',
        'ator',
        'entidade',
        'entidade_id',
        'status',
    ]
    list_filter = ['categoria', 'status']
    search_fields = ['tipo', 'ator', 'entidade_id', 'correlation_id']
    date_hierarchy = 'ocorrido_em'
