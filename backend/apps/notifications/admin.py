"""
Admin das notificacoes - somente leitura.

Quem escreve aqui sao os services da Oportunidade: a decisao *Revisar* avisa a
organizacao demandante. A caixa e do Demandante Externo (PB26); o canal - tela
propria, e-mail ou os dois - segue em aberto (P17). ate la esta tabela e so
consulta.
"""
from django.contrib import admin

from apps.notifications.models import Notificacao
from core.admin import AdminSomenteLeitura


@admin.register(Notificacao)
class NotificacaoAdmin(AdminSomenteLeitura):
    list_display = ['usuario', 'tipo', 'titulo', 'entidade', 'lida_em', 'criado_em']
    list_filter = ['tipo', 'entidade']
    search_fields = ['titulo', 'mensagem', 'usuario__email']
    date_hierarchy = 'criado_em'
