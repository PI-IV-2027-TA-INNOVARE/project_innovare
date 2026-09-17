"""
Bases de admin compartilhadas pelos apps de dominio.

O `/admin/` do Django e ferramenta de operacao e suporte, nao a tela do ator
Administrador - essa vive no front e fala com a API. O corte que segue vem dai:
cadastro de apoio se edita por aqui; registro de fluxo so se le, porque a regra
que o mantem coerente mora no service, nao no formulario.
"""
from django.contrib import admin


class SomenteLeituraMixin:
    """Nega add, change e delete, e devolve todo campo como somente leitura."""

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_readonly_fields(self, request, obj=None):
        return [campo.name for campo in self.model._meta.fields]


class AdminSomenteLeitura(SomenteLeituraMixin, admin.ModelAdmin):
    """
    Registro de fluxo: aparece no `/admin/`, nao se edita por la.

    Codigo sequencial com `select_for_update`, escopo de leitura por ator e a
    `CheckConstraint` de origem da oportunidade sustentam invariantes que um
    formulario de admin atravessaria sem perceber.
    """


class InlineSomenteLeitura(SomenteLeituraMixin, admin.TabularInline):
    """Os filhos de um registro de fluxo, exibidos junto do pai."""

    extra = 0
    can_delete = False
    show_change_link = True
