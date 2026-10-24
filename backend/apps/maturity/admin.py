"""
Admin da pre-analise PIPE/FAPESP.

`CriterioPreAnalise` e cadastro de apoio versionado e fica editavel - e o lugar
onde o conteudo de P4 vai entrar quando o PO fechar. A analise executada, nao:
ela e o retrato de uma proposta sob uma versao de criterios, e retrato nao se
retoca.
"""
from django.contrib import admin

from apps.maturity.models import (
    CriterioPreAnalise,
    PreAnalise,
    PreAnaliseDimensao,
    Recomendacao,
    VersaoCriterio,
)
from core.admin import AdminSomenteLeitura, InlineSomenteLeitura


class DimensaoInline(InlineSomenteLeitura):
    model = PreAnaliseDimensao


@admin.register(VersaoCriterio)
class VersaoCriterioAdmin(admin.ModelAdmin):
    list_display = ['versao', 'baseline', 'vigente_de', 'vigente_ate']
    search_fields = ['versao', 'baseline']


@admin.register(CriterioPreAnalise)
class CriterioPreAnaliseAdmin(admin.ModelAdmin):
    list_display = ['versao_criterio', 'dimensao', 'codigo', 'peso']
    list_filter = ['versao_criterio', 'dimensao']
    search_fields = ['codigo', 'descricao']
    ordering = ['versao_criterio__versao', 'dimensao', 'codigo']
    list_select_related = ['versao_criterio']


@admin.register(PreAnalise)
class PreAnaliseAdmin(AdminSomenteLeitura):
    list_display = [
        'id_pre_analise',
        'proposta',
        'versao_criterio',
        'versao_proposta',
        'status',
        'executada_em',
    ]
    list_filter = ['status', 'versao_criterio']
    search_fields = ['proposta__oportunidade__codigo']
    date_hierarchy = 'executada_em'
    inlines = [DimensaoInline]


@admin.register(PreAnaliseDimensao)
class PreAnaliseDimensaoAdmin(AdminSomenteLeitura):
    list_display = ['pre_analise', 'dimensao', 'nivel', 'ordem']
    list_filter = ['dimensao', 'nivel']
    search_fields = ['avaliacao']


@admin.register(Recomendacao)
class RecomendacaoAdmin(AdminSomenteLeitura):
    list_display = ['oportunidade', 'origem', 'acatada', 'acatada_em', 'criado_em']
    list_filter = ['origem', 'acatada']
    search_fields = ['texto', 'oportunidade__codigo']
