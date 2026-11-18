"""
Os limites de pedidos que o DRF nao traz prontos.

O das rotas que chamam a IA: cada chamada ao Gemini custa e demora; o limite geral (240 por minuto) deixava
uma conta invadida gastar o teto do mes em minutos. Aqui conta so o `POST` das
acoes que a view declara em `acoes_com_ia`, por pessoa, e todas somam no mesmo
limite (`LIMITE_DA_IA`). O teto de gasto por oportunidade continua valendo.

Os demais - envio de anexo, entrada por conta e entrada no `/admin/` - estao
descritos em cada classe.

A taxa e lida da settings a cada pedido, e nao do dicionario do DRF: e o que
deixa o teste ligar o limite com `override_settings`.
"""
from __future__ import annotations

import hashlib

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


class LimiteDeEnvioDeAnexo(SimpleRateThrottle):
    """
    O envio de anexo, por pessoa (N2).

    Com o limite geral, uma conta enviava 240 arquivos por minuto, e o disco
    enchia antes de alguem notar. Conta so o `POST` da acao `anexos`; ler a
    lista e baixar nao gastam.
    """

    scope = 'anexos'

    def get_rate(self):
        return getattr(settings, 'LIMITE_DE_ANEXOS', None) or None

    def get_cache_key(self, request, view):
        if request.method != 'POST' or getattr(view, 'action', None) != 'anexos':
            return None

        if request.user and request.user.is_authenticated:
            identidade = request.user.pk
        else:
            identidade = self.get_ident(request)

        return self.cache_format % {'scope': self.scope, 'ident': identidade}


class LimitePorConta(SimpleRateThrottle):
    """
    A entrada e a recuperacao de senha, contadas pelo e-mail digitado.

    O limite por IP nao segura quem tenta a senha de uma conta a partir de
    muitos enderecos. A view declara em `limite_por_conta` qual limite de
    `LIMITES_POR_CONTA` vale para ela, e cada um tem o seu contador: pedir
    recuperacao nao gasta as tentativas de entrada.

    Conta o e-mail como veio, exista a conta ou nao: limitar so as contas que
    existem diria quais e-mails estao cadastrados. A chave guarda o resumo do
    e-mail, e nao o e-mail.
    """

    scope = 'conta'

    def get_rate(self):
        return None

    def allow_request(self, request, view):
        nome = getattr(view, 'limite_por_conta', None)
        taxa = (getattr(settings, 'LIMITES_POR_CONTA', None) or {}).get(nome)

        if not taxa or request.method != 'POST':
            return True

        self.nome = nome
        self.rate = taxa
        self.num_requests, self.duration = self.parse_rate(taxa)

        return super().allow_request(request, view)

    def get_cache_key(self, request, view):
        dados = request.data
        email = str(dados.get('email') or '').strip().lower() if hasattr(dados, 'get') else ''

        if not email:
            return None

        return self.cache_format % {
            'scope': f'{self.scope}_{self.nome}',
            'ident': hashlib.sha256(email.encode('utf-8')).hexdigest(),
        }


class LimiteDeEntradaNoAdmin(SimpleRateThrottle):
    """
    As tentativas de senha no `/admin/` do Django, por endereco.

    O `/admin/` nao passa pelo DRF; quem aplica este limite e o middleware
    `TravaDoAdmin`.
    """

    scope = 'entrada_no_admin'

    def get_rate(self):
        return getattr(settings, 'LIMITE_DE_ENTRADA_NO_ADMIN', None) or None

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}
