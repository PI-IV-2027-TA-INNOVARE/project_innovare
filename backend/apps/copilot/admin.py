"""
Admin do Copiloto e da proposta estruturada - somente leitura.

A conversa e o material que reconstroi *por que* a proposta ficou como ficou.
Editar mensagem ou versao por fora do fluxo apaga essa reconstrucao.
"""
from django.contrib import admin

from apps.copilot.models import (
    Lacuna,
    MensagemCopiloto,
    ObjetivoEspecifico,
    PropostaEstruturada,
    SessaoCopiloto,
)
from core.admin import AdminSomenteLeitura, InlineSomenteLeitura


class MensagemInline(InlineSomenteLeitura):
    model = MensagemCopiloto


class ObjetivoInline(InlineSomenteLeitura):
    model = ObjetivoEspecifico


@admin.register(PropostaEstruturada)
class PropostaEstruturadaAdmin(AdminSomenteLeitura):
    list_display = [
        'oportunidade',
        'versao',
        'revisada_por_humano',
        'revisor',
        'atualizado_em',
    ]
    list_filter = ['revisada_por_humano']
    search_fields = ['oportunidade__codigo']
    inlines = [ObjetivoInline]


@admin.register(ObjetivoEspecifico)
class ObjetivoEspecificoAdmin(AdminSomenteLeitura):
    list_display = ['proposta', 'ordem', 'descricao']
    search_fields = ['descricao', 'proposta__oportunidade__codigo']


@admin.register(SessaoCopiloto)
class SessaoCopilotoAdmin(AdminSomenteLeitura):
    list_display = ['id_sessao', 'oportunidade', 'estado', 'iniciada_por', 'criado_em']
    list_filter = ['estado']
    search_fields = ['oportunidade__codigo']
    date_hierarchy = 'criado_em'
    inlines = [MensagemInline]


@admin.register(MensagemCopiloto)
class MensagemCopilotoAdmin(AdminSomenteLeitura):
    list_display = ['sessao', 'ordem', 'autor', 'criado_em']
    list_filter = ['autor']
    search_fields = ['conteudo']


@admin.register(Lacuna)
class LacunaAdmin(AdminSomenteLeitura):
    list_display = ['proposta', 'tipo', 'severidade', 'resolvida', 'criado_em']
    list_filter = ['tipo', 'severidade', 'resolvida']
    search_fields = ['descricao', 'proposta__oportunidade__codigo']
