"""
Excecoes de dominio e tratador de erro padronizado da API.

Regra de camada: um `service` levanta `ErroDeDominio`; a `view` nao traduz nada
a mao - o tratador abaixo converte para a resposta HTTP.
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


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


def tratador_de_erro(exc, context):
    """Handler do DRF: `ErroDeDominio` vira resposta; o resto segue o padrao."""
    if isinstance(exc, ErroDeDominio):
        return Response(
            {'detail': exc.detalhe, 'codigo': exc.codigo},
            status=exc.status_code,
        )

    return drf_exception_handler(exc, context)
