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
    SituacaoDaBaseSerializer,
)
from apps.maturity.services import (
    ImportarCriteriosService,
    criterios_vigentes,
    situacao_da_base,
)
from core.permissions import EhAdministrador, TemPapel


class LeCriterios(TemPapel):
    """Quem precisa dos criterios: quem os administra e quem os usa."""

    papeis_permitidos = (Papel.ADMINISTRADOR, Papel.SUPERVISOR)


class SaudeView(views.APIView):
    """
    `GET /api/ia/saude/` - o que a tela Saude le, um bloco por pergunta.

    - `desempenho`: tempo das ultimas 500 acoes da API, sem a espera pela IA
      de provedor, contra o limite de 3 s.
    - `ia`: consumo do mes da IA de provedor, a que cobra: usos, falhas,
      tokens, custo contra o teto e uma linha por provedor e modelo.
    - `comparacao`: o modelo que roda no proprio servidor e da a afinidade
      com o tema no matching; conta as rodadas do mes que sairam sem ela.
    - `jobs`: a fila de tarefas em segundo plano.
    - `banco`: se o banco responde.

    Cada bloco tem um `<bloco>_erro`: a falha de leitura de um nao derruba os
    outros.
    """

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


class SituacaoDaBaseView(views.APIView):
    """
    `GET /api/ia/criterios/arquivo/` - o arquivo da base PIPE contra a versao em uso.

    O Administrador ve o que ativar mudaria antes de confirmar. Arquivo ausente
    nao e erro aqui: a tela explica; o 409 fica para quem tenta ativar.
    """

    permission_classes = [permissions.IsAuthenticated, EhAdministrador]

    @extend_schema(responses=SituacaoDaBaseSerializer)
    def get(self, request):
        return Response(SituacaoDaBaseSerializer(situacao_da_base()).data)
