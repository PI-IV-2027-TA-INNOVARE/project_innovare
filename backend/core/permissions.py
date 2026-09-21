"""
Classes de permissao por ator.

A matriz vive em `CONTEXT.md` secao 3. O portao da rota e ergonomia; o portao
real e a combinacao destas classes com o `get_queryset` de cada viewset
(AGENTS.md, plano A4).
"""
from rest_framework.permissions import BasePermission

from apps.accounts.models import Papel


class TemPapel(BasePermission):
    """Base: subclasses declaram `papeis_permitidos`."""

    papeis_permitidos = ()
    message = 'Seu perfil nao tem competencia para esta acao.'

    def has_permission(self, request, view):
        usuario = request.user
        return bool(
            usuario
            and usuario.is_authenticated
            and usuario.papel in self.papeis_permitidos
        )


class EhAdministrador(TemPapel):
    papeis_permitidos = (Papel.ADMINISTRADOR,)


class EhSupervisor(TemPapel):
    papeis_permitidos = (Papel.SUPERVISOR,)


class EhPesquisador(TemPapel):
    papeis_permitidos = (Papel.PESQUISADOR,)


class EhDemandante(TemPapel):
    papeis_permitidos = (Papel.DEMANDANTE,)


class EhSupervisorOuDemandante(TemPapel):
    papeis_permitidos = (Papel.SUPERVISOR, Papel.DEMANDANTE)
