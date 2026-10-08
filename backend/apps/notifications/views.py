"""
Views da caixa de notificacoes.

O portao e por papel: a caixa e do Demandante Externo. PB26 - "quando o
Supervisor solicita complementacao, entao o Demandante Externo e notificado da
pendencia" - e PB27 sao as duas historias do backlog que citam notificacao, e
as duas falam do Demandante. A resposta do Demandante chega ao Supervisor pela
propria oportunidade e pela aba Historico, que e onde a PB27 promete que ela
esteja visivel.

Dentro da caixa, o filtro por `usuario` continua sendo o portao do dado: nenhuma
rota recebe o dono por parametro, e nao ha como pedir a caixa de outra pessoa.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import views
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
from core.permissions import EhDemandante


class CaixaListView(ListAPIView):
    """`GET /api/notificacoes/` - o que avisaram a quem esta autenticado."""

    permission_classes = [EhDemandante]
    serializer_class = NotificacaoSerializer

    def get_queryset(self):
        filtros = FiltroCaixaSerializer(data=self.request.query_params)
        filtros.is_valid(raise_exception=True)

        return caixa_de(self.request.user, **filtros.validated_data)


class NaoLidasView(views.APIView):
    """`GET /api/notificacoes/nao-lidas/` - o numero do selo do sino."""

    permission_classes = [EhDemandante]

    @extend_schema(responses=TotalSerializer)
    def get(self, request):
        return Response(
            TotalSerializer({'total': nao_lidas_de(request.user)}).data
        )


class MarcarComoLidaView(views.APIView):
    """`POST /api/notificacoes/{id}/lida/` - a pessoa deu baixa no aviso."""

    permission_classes = [EhDemandante]

    @extend_schema(request=None, responses=NotificacaoSerializer)
    def post(self, request, id_notificacao):
        notificacao = marcar_como_lida(
            usuario=request.user, id_notificacao=id_notificacao
        )

        return Response(NotificacaoSerializer(notificacao).data)


class MarcarTodasComoLidasView(views.APIView):
    """`POST /api/notificacoes/marcar-todas-lidas/` - limpa o selo de uma vez."""

    permission_classes = [EhDemandante]

    @extend_schema(request=None, responses=TotalSerializer)
    def post(self, request):
        return Response(
            TotalSerializer({'total': marcar_todas_como_lidas(request.user)}).data
        )
