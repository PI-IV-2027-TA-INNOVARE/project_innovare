"""
View dos indicadores.

Recebe, delega e responde: o escopo por ator e a composicao dos numeros moram
no service.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, views
from rest_framework.response import Response

from apps.accounts.models import Papel
from apps.dashboard.serializers import IndicadoresSerializer
from apps.dashboard.services.indicadores import indicadores_de
from core.permissions import TemPapel


class AcompanhaOFluxo(TemPapel):
    """
    Quem acompanha oportunidade (CONTEXT.md secao 3).

    O Administrador fica de fora: a matriz lhe da o administrativo - contas,
    permissoes, configuracao -, e o que ele precisa auditar esta na trilha.
    """

    papeis_permitidos = (Papel.SUPERVISOR, Papel.PESQUISADOR, Papel.DEMANDANTE)


class IndicadoresView(views.APIView):
    """`GET /api/indicadores/` - numeros do fluxo, no escopo do ator (RF14)."""

    permission_classes = [permissions.IsAuthenticated, AcompanhaOFluxo]

    @extend_schema(responses=IndicadoresSerializer)
    def get(self, request):
        dados = indicadores_de(request.user)

        return Response(IndicadoresSerializer(dados).data)
