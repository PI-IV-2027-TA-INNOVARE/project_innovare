"""
Admin da oportunidade - somente leitura.

O registro central nasce e muda pelos services: o codigo vem de
`SequenciaCodigo.proximo_codigo`, a origem vem do ator e nao do payload, e cada
mudanca deixa evento na trilha. Um formulario de admin nao percorre nada disso.
"""
from django.contrib import admin

from apps.opportunities.models import (
    AnexoOportunidade,
    Oportunidade,
    SequenciaCodigo,
)
from core.admin import AdminSomenteLeitura, InlineSomenteLeitura


class AnexoInline(InlineSomenteLeitura):
    model = AnexoOportunidade


@admin.register(Oportunidade)
class OportunidadeAdmin(AdminSomenteLeitura):
    list_display = [
        'codigo',
        'titulo',
        'origem',
        'situacao',
        'responsavel',
        'atualizada_em',
    ]
    list_filter = ['situacao', 'origem']
    search_fields = ['codigo', 'titulo']
    date_hierarchy = 'criada_em'
    inlines = [AnexoInline]


@admin.register(AnexoOportunidade)
class AnexoOportunidadeAdmin(AdminSomenteLeitura):
    list_display = [
        'nome_original',
        'oportunidade',
        'mime',
        'tamanho_bytes',
        'enviado_por',
        'criado_em',
    ]
    search_fields = ['nome_original', 'oportunidade__codigo']


@admin.register(SequenciaCodigo)
class SequenciaCodigoAdmin(AdminSomenteLeitura):
    """
    O contador anual de `OP-2026-014`.

    Somente leitura sem excecao: corrigir `ultimo_numero` a mao e a forma mais
    rapida de gerar codigo duplicado e derrubar o `unique` no proximo cadastro.
    """

    list_display = ['ano', 'ultimo_numero']
