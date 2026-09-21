"""
Admin da configuracao da plataforma - cadastro de apoio, editavel.

`revisao` fica somente leitura: ela e o contador que a API incrementa a cada
merge patch e que o front usa para detectar escrita concorrente. Alterar o
`payload` por aqui e suporte legitimo; forjar a revisao a mao nao e.
"""
from django.contrib import admin

from apps.platform_settings.models import ConfiguracaoPlataforma, ContatoSuporte


@admin.register(ConfiguracaoPlataforma)
class ConfiguracaoPlataformaAdmin(admin.ModelAdmin):
    list_display = ['secao', 'revisao', 'atualizado_por', 'atualizado_em']
    search_fields = ['secao']
    ordering = ['secao']
    raw_id_fields = ['atualizado_por']
    readonly_fields = ['revisao', 'atualizado_em']


@admin.register(ContatoSuporte)
class ContatoSuporteAdmin(admin.ModelAdmin):
    list_display = ['nome', 'papel', 'email', 'telefone', 'ordem', 'ativo']
    list_filter = ['ativo']
    search_fields = ['nome', 'email', 'papel']
    ordering = ['ordem', 'nome']
