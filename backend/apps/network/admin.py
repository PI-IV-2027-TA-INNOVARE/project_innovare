"""
Admin da rede interna - cadastro de apoio, editavel.

Editar `situacao` aqui nao cria conta: quem provisiona acesso e
`POST /api/rede/{id}/liberar-acesso/`, que emite o token de convite e grava o
evento de auditoria (RN-A04).
"""
from django.contrib import admin

from apps.network.models import (
    Competencia,
    Formacao,
    MembroCompetencia,
    MembroRede,
    Titulacao,
)


class MembroCompetenciaInline(admin.TabularInline):
    model = MembroCompetencia
    extra = 0
    raw_id_fields = ['competencia']
    readonly_fields = ['criado_em']


class FormacaoInline(admin.TabularInline):
    model = Formacao
    extra = 0
    raw_id_fields = ['titulacao']
    readonly_fields = ['criado_em', 'atualizado_em']


@admin.register(Titulacao)
class TitulacaoAdmin(admin.ModelAdmin):
    list_display = ['rotulo', 'codigo', 'nivel']
    search_fields = ['codigo', 'rotulo']
    ordering = ['nivel']


@admin.register(Competencia)
class CompetenciaAdmin(admin.ModelAdmin):
    list_display = ['nome', 'tipo', 'canonica', 'sinonimo_de', 'ativo']
    list_filter = ['tipo', 'canonica', 'ativo']
    search_fields = ['nome']
    ordering = ['nome']
    raw_id_fields = ['sinonimo_de']
    readonly_fields = ['criado_em', 'atualizado_em']


@admin.register(MembroRede)
class MembroRedeAdmin(admin.ModelAdmin):
    list_display = [
        'nome',
        'email',
        'papel_rede',
        'titulacao',
        'situacao',
        'disponibilidade',
    ]
    list_filter = ['papel_rede', 'situacao', 'disponibilidade']
    search_fields = ['nome', 'email']
    ordering = ['nome']
    exclude = ['competencias']
    raw_id_fields = ['usuario', 'titulacao', 'organizacao', 'cadastrado_por']
    readonly_fields = ['criado_em', 'atualizado_em']
    inlines = [MembroCompetenciaInline, FormacaoInline]


@admin.register(MembroCompetencia)
class MembroCompetenciaAdmin(admin.ModelAdmin):
    list_display = ['membro', 'competencia', 'nivel', 'declarado_por']
    list_filter = ['declarado_por']
    search_fields = ['membro__nome', 'competencia__nome']
    raw_id_fields = ['membro', 'competencia']
    readonly_fields = ['criado_em']


@admin.register(Formacao)
class FormacaoAdmin(admin.ModelAdmin):
    list_display = ['membro', 'curso', 'instituicao', 'titulacao', 'ano_conclusao']
    search_fields = ['membro__nome', 'curso', 'instituicao']
    raw_id_fields = ['membro', 'titulacao']
    readonly_fields = ['criado_em', 'atualizado_em']
