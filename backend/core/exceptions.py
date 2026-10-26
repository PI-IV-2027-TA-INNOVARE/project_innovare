"""
Excecoes de dominio e tratador de erro padronizado da API.

Regra de camada: um `service` levanta `ErroDeDominio`; a `view` nao traduz nada
a mao - o tratador abaixo converte para a resposta HTTP.
"""
import logging
import math

from rest_framework import status
from rest_framework.exceptions import Throttled
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.views import set_rollback

logger = logging.getLogger(__name__)

MENSAGEM_ERRO_INTERNO = (
    'O servidor encontrou um erro inesperado. Tente novamente em instantes; '
    'se continuar, avise o suporte.'
)


def mensagem_de_espera(segundos) -> str:
    """O limite de pedidos em linguagem de tela, com quanto falta para liberar."""
    if not segundos:
        return 'Muitos pedidos seguidos. Aguarde um pouco e tente de novo.'

    minutos = max(1, math.ceil(segundos / 60))
    unidade = 'minuto' if minutos == 1 else 'minutos'
    return f'Muitos pedidos seguidos. Tente de novo em {minutos} {unidade}.'


class ErroDeDominio(Exception):
    """Regra de negocio violada. Vira 400 salvo se a subclasse disser outra coisa."""

    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, detalhe, codigo=None):
        super().__init__(detalhe)
        self.detalhe = detalhe
        self.codigo = codigo or self.__class__.__name__


class AcaoNaoPermitida(ErroDeDominio):
    """O ator autenticado nao tem competencia para a acao (CONTEXT.md secao 3)."""

    status_code = status.HTTP_403_FORBIDDEN


class RecursoNaoEncontrado(ErroDeDominio):
    status_code = status.HTTP_404_NOT_FOUND


class ConflitoDeEstado(ErroDeDominio):
    """A entidade nao esta no estado que a operacao exige."""

    status_code = status.HTTP_409_CONFLICT


class ServicoIndisponivel(ErroDeDominio):
    """Um servico de fora (e-mail, por exemplo) falhou, e a operacao nao foi feita."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


def tratador_de_erro(exc, context):
    """
    Handler do DRF: toda falha sai no contrato de erro da API.

    `ErroDeDominio` vira a resposta do status dele; o que o DRF conhece segue
    o padrao dele. O resto e erro inesperado: vira 500 com mensagem generica, e
    o detalhe tecnico vai para o log. Sem isso, com `DEBUG=True` o Django
    respondia com a pagina HTML de debug - SQL e settings inclusos.
    """
    if isinstance(exc, ErroDeDominio):
        return Response(
            {'detail': exc.detalhe, 'codigo': exc.codigo},
            status=exc.status_code,
        )

    resposta = drf_exception_handler(exc, context)

    if isinstance(exc, Throttled) and resposta is not None:
        resposta.data = {'detail': mensagem_de_espera(exc.wait), 'codigo': 'limite_de_pedidos'}

    if resposta is not None:
        return resposta

    requisicao = context.get('request')
    logger.exception(
        'Erro inesperado em %s %s',
        getattr(requisicao, 'method', '?'),
        getattr(requisicao, 'path', '?'),
        exc_info=exc,
    )
    set_rollback()

    return Response(
        {'detail': MENSAGEM_ERRO_INTERNO, 'codigo': 'erro_interno'},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
