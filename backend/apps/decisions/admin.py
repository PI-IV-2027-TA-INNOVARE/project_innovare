"""
Admin da decisao do Supervisor - somente leitura.

RN-A07: a decisao e o fecho do fluxo e a unica seta que automacao alguma
percorre sozinha. Registrar uma por formulario de admin seria exatamente isso,
sem justificativa, sem autor conferido e sem evento na trilha.
"""
from django.contrib import admin

from apps.decisions.models import Decisao
from core.admin import AdminSomenteLeitura


@admin.register(Decisao)
class DecisaoAdmin(AdminSomenteLeitura):
    list_display = ['oportunidade', 'tipo', 'autor', 'registrada_em']
    list_filter = ['tipo']
    search_fields = ['oportunidade__codigo', 'justificativa']
    date_hierarchy = 'registrada_em'
