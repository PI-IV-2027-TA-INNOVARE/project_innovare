"""Admin das organizacoes - cadastro de apoio, editavel."""
from django.contrib import admin

from apps.organizations.models import Organizacao


@admin.register(Organizacao)
class OrganizacaoAdmin(admin.ModelAdmin):
    list_display = ['nome', 'tipo', 'cnpj', 'municipio', 'uf', 'ativo']
    list_filter = ['tipo', 'ativo', 'uf']
    search_fields = ['nome', 'razao_social', 'cnpj']
    ordering = ['nome']
    readonly_fields = ['criado_em', 'atualizado_em']
