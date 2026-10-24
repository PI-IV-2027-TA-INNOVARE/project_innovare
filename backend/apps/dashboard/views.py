"""
View dos indicadores.

Recebe, delega e responde: o escopo por ator e a composicao dos numeros moram
no service.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, views
from rest_framework.response import Response

from apps.accounts.models import Papel
from apps.dashboard.serializers import (
    IndicadoresDeIASerializer,
    IndicadoresSerializer,
)
from apps.dashboard.services.indicadores import indicadores_de
from apps.dashboard.services.indicadores_ia import indicadores_de_ia
from core.permissions import EhSupervisor, TemPapel


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


class IndicadoresDeIAView(views.APIView):
    """
    `GET /api/indicadores/ia/` - matching e maturidade (PB74, PB75).

    Rota propria, e nao mais um bloco de `/api/indicadores/`: o painel que abre
    com a sessao tem orcamento de tres consultas, e estes dois blocos leem
    cinco tabelas. A tela de Indicadores os busca depois de estar de pe.

    Do Supervisor: as duas historias dizem "como Supervisor", e o PB71 mantem o
    Demandante fora do resultado interno.
    """

    permission_classes = [permissions.IsAuthenticated, EhSupervisor]

    @extend_schema(responses=IndicadoresDeIASerializer)
    def get(self, request):
        return Response(IndicadoresDeIASerializer(indicadores_de_ia(request.user)).data)
