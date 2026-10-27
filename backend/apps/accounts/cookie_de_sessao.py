"""
O token de renovacao num cookie que o JavaScript nao le.

No localStorage, qualquer script que rodasse na pagina - uma falha de XSS -
levava a sessao inteira. No cookie `HttpOnly`, o navegador o guarda, so o manda
para as rotas de acesso (`/api/auth/`) e nenhum script o enxerga. O token de
acesso, de vida curta, segue no corpo da resposta e fica so na memoria do front.

Renovar pelo cookie exige que o pedido venha do proprio site ou de uma origem
da lista do CORS: e o que impede outra pagina de usar o cookie do visitante.
"""
from __future__ import annotations

from django.conf import settings

NOME = 'pdconnect_refresh'
CAMINHO = '/api/auth/'


def _validade_em_segundos() -> int:
    return int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())


def gravar_renovacao(resposta, refresh: str) -> None:
    resposta.set_cookie(
        NOME,
        refresh,
        max_age=_validade_em_segundos(),
        path=CAMINHO,
        secure=settings.AUTH_COOKIE_SECURE,
        httponly=True,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )


def apagar_renovacao(resposta) -> None:
    resposta.delete_cookie(NOME, path=CAMINHO, samesite=settings.AUTH_COOKIE_SAMESITE)


def renovacao_do_pedido(request) -> str:
    return request.COOKIES.get(NOME, '')


def origem_confiavel(request) -> bool:
    """
    O pedido vem do proprio site ou de uma origem que o CORS ja autoriza.

    Sem cabecalho `Origin` - cliente que nao e navegador, ou pedido do mesmo
    site em navegador antigo - nao ha outra pagina por tras.
    """
    origem = request.headers.get('Origin')

    if not origem:
        return True

    return origem == f'{request.scheme}://{request.get_host()}' or origem in settings.CORS_ALLOWED_ORIGINS
