"""
Views da configuracao administravel.

A view recebe, delega e responde. O merge patch mora no service.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, serializers, views
from rest_framework.response import Response

from apps.platform_settings.serializers import ConfiguracaoSerializer, secao_vazia
from apps.platform_settings.services.configuracoes import (
    SECAO_TEMA,
    AtualizarConfiguracaoService,
    obter_configuracao,
)
from core.permissions import EhAdministrador


class TemaView(views.APIView):
    """
    `/api/configuracoes/tema/` - a paleta da organizacao.

    O GET e publico de proposito: a tela de login precisa pintar a marca antes
    de existir JWT. O PATCH e do Administrador e recebe o **diff**, nunca o
    documento inteiro - duas abas abertas nao se sobrescrevem.
    """

    def get_permissions(self):
        if self.request.method == 'PATCH':
            return [permissions.IsAuthenticated(), EhAdministrador()]

        return [permissions.AllowAny()]

    @extend_schema(responses=ConfiguracaoSerializer)
    def get(self, request):
        configuracao = obter_configuracao(SECAO_TEMA)

        if configuracao is None:
            return Response(secao_vazia(SECAO_TEMA))

        return Response(ConfiguracaoSerializer(configuracao).data)

    @extend_schema(request=None, responses=ConfiguracaoSerializer)
    def patch(self, request):
        if not isinstance(request.data, dict):
            raise serializers.ValidationError(
                'O corpo do merge patch precisa ser um objeto.'
            )

        configuracao = AtualizarConfiguracaoService().execute(
            secao=SECAO_TEMA, patch=request.data, ator=request.user
        )

        return Response(ConfiguracaoSerializer(configuracao).data)
