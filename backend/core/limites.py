"""
O limite proprio de pedidos para as rotas que chamam a IA.

Cada chamada ao Gemini custa e demora; o limite geral (240 por minuto) deixava
uma conta invadida gastar o teto do mes em minutos. Aqui conta so o `POST` das
acoes que a view declara em `acoes_com_ia`, por pessoa, e todas somam no mesmo
limite (`LIMITE_DA_IA`). O teto de gasto por oportunidade continua valendo.

A taxa e lida da settings a cada pedido, e nao do dicionario do DRF: e o que
deixa o teste ligar o limite com `override_settings`.
"""
from __future__ import annotations

from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle


class LimiteDaIA(SimpleRateThrottle):
    scope = 'ia'

    def get_rate(self):
        return getattr(settings, 'LIMITE_DA_IA', None) or None

    def get_cache_key(self, request, view):
        if request.method != 'POST':
            return None

        if getattr(view, 'action', None) not in getattr(view, 'acoes_com_ia', ()):
            return None

        if request.user and request.user.is_authenticated:
            identidade = request.user.pk
        else:
            identidade = self.get_ident(request)

        return self.cache_format % {'scope': self.scope, 'ident': identidade}
