"""
Views da caixa de notificacoes.

Sem classe de permissao por papel, e de proposito: a caixa nao e de um ator, e
de uma pessoa. O portao aqui e o `usuario` do service, que nenhuma rota recebe
por parametro - nao ha como pedir a caixa de outro.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, views
from rest_framework.generics import ListAPIView
from rest_framework.response import Response

from apps.notifications.serializers import (
    FiltroCaixaSerializer,
    NotificacaoSerializer,
    TotalSerializer,
)
from apps.notifications.services import (
    caixa_de,
    marcar_como_lida,
    marcar_todas_como_lidas,
    nao_lidas_de,
)


class CaixaListView(ListAPIView):
    """`GET /api/notificacoes/` - o que avisaram a quem esta autenticado."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = NotificacaoSerializer

    def get_queryset(self):
        filtros = FiltroCaixaSerializer(data=self.request.query_params)
        filtros.is_valid(raise_exception=True)

        return caixa_de(self.request.user, **filtros.validated_data)


class NaoLidasView(views.APIView):
    """`GET /api/notificacoes/nao-lidas/` - o numero do selo do sino."""

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=TotalSerializer)
    def get(self, request):
        return Response(
            TotalSerializer({'total': nao_lidas_de(request.user)}).data
        )


class MarcarComoLidaView(views.APIView):
    """`POST /api/notificacoes/{id}/lida/` - a pessoa deu baixa no aviso."""

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses=NotificacaoSerializer)
    def post(self, request, id_notificacao):
        notificacao = marcar_como_lida(
            usuario=request.user, id_notificacao=id_notificacao
        )

        return Response(NotificacaoSerializer(notificacao).data)


class MarcarTodasComoLidasView(views.APIView):
    """`POST /api/notificacoes/marcar-todas-lidas/` - limpa o selo de uma vez."""

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses=TotalSerializer)
    def post(self, request):
        return Response(
            TotalSerializer({'total': marcar_todas_como_lidas(request.user)}).data
        )
