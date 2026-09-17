"""
Django admin das contas.

Ferramenta de operacao e suporte, nao a tela do ator Administrador - essa vive
no front e fala com a API.
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from apps.accounts.models import TokenAcesso, Usuario


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    ordering = ['nome']
    list_display = ['nome', 'email', 'papel', 'situacao', 'ultimo_acesso']
    list_filter = ['papel', 'situacao']
    search_fields = ['nome', 'email']
    readonly_fields = ['ultimo_acesso', 'criado_em', 'atualizado_em', 'last_login']

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Identificacao', {'fields': ('nome', 'organizacao')}),
        ('Acesso', {'fields': ('papel', 'situacao')}),
        ('Permissoes tecnicas', {'fields': ('is_staff', 'is_superuser', 'groups',
                                            'user_permissions')}),
        ('Datas', {'fields': ('ultimo_acesso', 'last_login', 'criado_em',
                              'atualizado_em')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'nome', 'papel', 'password1', 'password2'),
        }),
    )


@admin.register(TokenAcesso)
class TokenAcessoAdmin(admin.ModelAdmin):
    list_display = ['usuario', 'finalidade', 'expira_em', 'usado_em']
    list_filter = ['finalidade']
    search_fields = ['usuario__email']
    readonly_fields = ['token', 'criado_em']
