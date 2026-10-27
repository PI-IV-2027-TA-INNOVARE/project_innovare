"""
Views de IA: saude da plataforma e criterios da pre-analise.

A saude e do Administrador (o console e dele). Os criterios tem dois publicos:
o Administrador, que importa a baseline em Parametros, e o Supervisor, que
precisa ler a versao vigente para interpretar o relatorio de maturidade.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, views
from rest_framework.response import Response

from apps.accounts.models import Papel
from apps.ai.serializers import SaudeSerializer
from apps.ai.services.saude import saude_da_plataforma
from apps.maturity.serializers import (
    CriterioPreAnaliseSerializer,
    ResultadoImportacaoCriteriosSerializer,
)
from apps.maturity.services import ImportarCriteriosService, criterios_vigentes
from core.permissions import EhAdministrador, TemPapel


class LeCriterios(TemPapel):
    """Quem precisa dos criterios: quem os administra e quem os usa."""

    papeis_permitidos = (Papel.ADMINISTRADOR, Papel.SUPERVISOR)


class SaudeView(views.APIView):
    """`GET /api/ia/saude/` - desempenho, consumo de IA, fila e processo."""

    permission_classes = [permissions.IsAuthenticated, EhAdministrador]

    @extend_schema(responses=SaudeSerializer)
    def get(self, request):
        return Response(SaudeSerializer(saude_da_plataforma()).data)


class CriteriosPreAnaliseView(views.APIView):
    """
    `GET` lista a versao vigente; `POST` importa a baseline PIPE.

    Nao existe PUT nem DELETE: criterio de fomento nao e digitado nem apagado
    pela tela - ele vem da Base de Conhecimento versionada (P4).
    """

    serializer_class = CriterioPreAnaliseSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated(), EhAdministrador()]

        return [permissions.IsAuthenticated(), LeCriterios()]

    @extend_schema(responses=CriterioPreAnaliseSerializer(many=True))
    def get(self, request):
        return Response(
            CriterioPreAnaliseSerializer(criterios_vigentes(), many=True).data
        )

    @extend_schema(responses=ResultadoImportacaoCriteriosSerializer)
    def post(self, request):
        resultado = ImportarCriteriosService().execute(ator=request.user)

        return Response(ResultadoImportacaoCriteriosSerializer(resultado).data)
