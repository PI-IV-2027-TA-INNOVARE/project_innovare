"""
Views da configuracao administravel.

A view recebe, delega e responde. O merge patch mora no service.
"""
from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, views
from rest_framework.response import Response

from apps.platform_settings.serializers import (
    ConfiguracaoSerializer,
    ContatoSuporteSerializer,
    PrivacidadeSerializer,
    TemaPatchSerializer,
    secao_vazia,
)
from apps.platform_settings.services.contatos import (
    RestaurarContatosService,
    SubstituirContatosService,
    contatos_vigentes,
    encarregado_de_dados,
)
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

    @extend_schema(request=TemaPatchSerializer, responses=ConfiguracaoSerializer)
    def patch(self, request):
        patch = TemaPatchSerializer(data=request.data)
        patch.is_valid(raise_exception=True)

        configuracao = AtualizarConfiguracaoService().execute(
            secao=SECAO_TEMA, patch=patch.validated_data, ator=request.user
        )

        return Response(ConfiguracaoSerializer(configuracao).data)


class PrivacidadeView(views.APIView):
    """
    `GET /api/privacidade/` - o contato do encarregado de dados, para o aviso.

    Publico como o aviso: quem ainda nao tem conta tambem precisa saber como
    os dados sao tratados e com quem falar.
    """

    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=PrivacidadeSerializer)
    def get(self, request):
        return Response(
            PrivacidadeSerializer(
                {
                    'encarregado': encarregado_de_dados(),
                    'contatos': contatos_vigentes(),
                    'retencao': {
                        'eventos_conta_meses': settings.RETENCAO_EVENTOS_CONTA_MESES,
                        'anexos_apos_arquivamento_meses': settings.RETENCAO_ANEXOS_MESES,
                    },
                }
            ).data
        )


class ContatosSuporteView(views.APIView):
    """
    `/api/configuracoes/contatos-suporte/` - quem procurar quando o acesso e barrado.

    O GET e publico pelo mesmo motivo do tema: a conta inativa e recusada antes
    de existir JWT e ainda assim precisa do contato. PUT troca a lista inteira e
    DELETE volta ao padrao da AC2; os dois sao do Administrador. Lista vazia
    nao passa: e a saida de quem foi barrado.
    """

    def get_permissions(self):
        if self.request.method in ('PUT', 'DELETE'):
            return [permissions.IsAuthenticated(), EhAdministrador()]

        return [permissions.AllowAny()]

    @extend_schema(responses=ContatoSuporteSerializer(many=True))
    def get(self, request):
        return Response(ContatoSuporteSerializer(contatos_vigentes(), many=True).data)

    @extend_schema(
        request=ContatoSuporteSerializer(many=True),
        responses=ContatoSuporteSerializer(many=True),
    )
    def put(self, request):
        contatos = ContatoSuporteSerializer(data=request.data, many=True, allow_empty=False)
        contatos.is_valid(raise_exception=True)

        gravados = SubstituirContatosService().execute(
            contatos=contatos.validated_data, ator=request.user
        )

        return Response(ContatoSuporteSerializer(gravados, many=True).data)

    @extend_schema(request=None, responses=ContatoSuporteSerializer(many=True))
    def delete(self, request):
        padrao = RestaurarContatosService().execute(ator=request.user)

        return Response(ContatoSuporteSerializer(padrao, many=True).data)
