"""
A documentacao da API: `/api/schema/` e `/api/docs/`.

Aberta so no desenvolvimento local com DEBUG, porque e por ela que o front se
guia (AGENTS.md 2.5). Fora disso so o Administrador le: o esquema e o mapa
inteiro da API (S7), e um `.env` local apontado para o banco oficial nao e
desenvolvimento.
"""
from django.conf import settings
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import BasePermission

from core.permissions import EhAdministrador


class SoAdministradorEmProducao(BasePermission):
    message = 'A documentação da API é restrita ao Administrador.'

    def has_permission(self, request, view):
        if settings.DEBUG and not settings.EM_PRODUCAO:
            return True

        return EhAdministrador().has_permission(request, view)


class EsquemaDaApi(SpectacularAPIView):
    permission_classes = [SoAdministradorEmProducao]


class DocumentacaoDaApi(SpectacularSwaggerView):
    permission_classes = [SoAdministradorEmProducao]
