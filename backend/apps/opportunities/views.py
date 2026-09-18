"""
Views da Oportunidade.

O portao real da leitura e `escopo_de()` no `get_queryset`; a permissao de rota
so decide quem pode tentar.
"""
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import Papel
from apps.audit.models import EventoAuditoria
from apps.opportunities.models import CATEGORIAS_VISIVEIS_AO_DEMANDANTE
from apps.opportunities.serializers import (
    AnexoSerializer,
    CadastroOportunidadeSerializer,
    ComplementacaoSerializer,
    DecisaoSerializer,
    EventoHistoricoSerializer,
    OportunidadeSerializer,
)
from apps.opportunities.services import (
    AnexarDocumentoService,
    AtualizarContextoService,
    CadastrarOportunidadeService,
    ComplementarOportunidadeService,
    RegistrarDecisaoService,
    escopo_de,
)
from core.exceptions import AcaoNaoPermitida
from core.permissions import EhSupervisor, TemPapel


class PodeVerOportunidade(TemPapel):
    """Os tres atores do fluxo. O Administrador nao entra (CONTEXT.md secao 3)."""

    papeis_permitidos = (Papel.SUPERVISOR, Papel.PESQUISADOR, Papel.DEMANDANTE)


class OportunidadeViewSet(viewsets.ModelViewSet):
    """
    `/api/oportunidades/` - o registro central do sistema (RF01).

    A URL usa o codigo (`OP-2026-014`), nao a PK: e o identificador que o
    cliente le, diz e digita.
    """

    serializer_class = OportunidadeSerializer
    lookup_field = 'codigo'
    lookup_value_regex = r'OP-\d{4}-\d{3}'
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_permissions(self):
        if self.action in ('decisao', 'partial_update'):
            return [permissions.IsAuthenticated(), EhSupervisor()]

        return [permissions.IsAuthenticated(), PodeVerOportunidade()]

    def get_queryset(self):
        queryset = escopo_de(self.request.user)

        situacao = self.request.query_params.get('situacao')
        if situacao:
            queryset = queryset.filter(situacao=situacao)

        origem = self.request.query_params.get('origem')
        if origem:
            queryset = queryset.filter(origem=origem)

        busca = self.request.query_params.get('busca')
        if busca:
            queryset = queryset.filter(
                Q(titulo__icontains=busca)
                | Q(codigo__icontains=busca)
                | Q(demandante__nome__icontains=busca)
            )

        return queryset

    @extend_schema(
        request=CadastroOportunidadeSerializer, responses=OportunidadeSerializer
    )
    def create(self, request, *args, **kwargs):
        serializer = CadastroOportunidadeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        oportunidade = CadastrarOportunidadeService().execute(
            dados=dict(serializer.validated_data), ator=request.user
        )

        return Response(
            self.get_serializer(oportunidade).data, status=status.HTTP_201_CREATED
        )

    def partial_update(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            self.get_object(), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)

        oportunidade = AtualizarContextoService().execute(
            oportunidade=self.get_object(),
            dados=dict(serializer.validated_data),
            ator=request.user,
        )

        return Response(self.get_serializer(oportunidade).data)

    @extend_schema(request=DecisaoSerializer, responses=OportunidadeSerializer)
    @action(detail=True, methods=['post'], url_path='decisao', url_name='decisao')
    def decisao(self, request, codigo=None):
        """Continuar, Revisar ou Arquivar - com justificativa (RN-A07)."""
        serializer = DecisaoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        oportunidade = self.get_object()

        RegistrarDecisaoService().execute(
            oportunidade=oportunidade,
            tipo=serializer.validated_data['tipo'],
            justificativa=serializer.validated_data['justificativa'],
            ator=request.user,
        )

        oportunidade.refresh_from_db()
        return Response(self.get_serializer(oportunidade).data)

    @extend_schema(
        request=ComplementacaoSerializer, responses=OportunidadeSerializer
    )
    @action(detail=True, methods=['post'], url_path='complementar',
            url_name='complementar')
    def complementar(self, request, codigo=None):
        """Resposta do Demandante ao pedido de revisao (PB27)."""
        if request.user.papel != Papel.DEMANDANTE:
            raise AcaoNaoPermitida(
                'A complementacao e respondida pelo Demandante.',
                codigo='papel_nao_complementa',
            )

        serializer = ComplementacaoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        oportunidade = ComplementarOportunidadeService().execute(
            oportunidade=self.get_object(),
            texto=serializer.validated_data['texto'],
            ator=request.user,
        )

        return Response(self.get_serializer(oportunidade).data)

    @extend_schema(responses=AnexoSerializer(many=True))
    @action(detail=True, methods=['get', 'post'], url_path='anexos',
            url_name='anexos', parser_classes=[MultiPartParser, FormParser])
    def anexos(self, request, codigo=None):
        """
        Anexos vinculados a oportunidade (PB21).

        A permissao e a mesma da oportunidade: quem alcanca o registro alcanca
        os documentos dele. O `get_object` ja aplicou o escopo.
        """
        oportunidade = self.get_object()

        if request.method == 'GET':
            return Response(
                AnexoSerializer(oportunidade.anexos.all(), many=True).data
            )

        arquivo = request.FILES.get('arquivo')

        if arquivo is None:
            return Response(
                {'detail': 'Envie o arquivo no campo `arquivo`.',
                 'codigo': 'arquivo_ausente'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        anexo = AnexarDocumentoService().execute(
            oportunidade=oportunidade, arquivo=arquivo, ator=request.user
        )

        return Response(
            AnexoSerializer(anexo).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(responses=EventoHistoricoSerializer(many=True))
    @action(detail=True, methods=['get'], url_path='historico',
            url_name='historico')
    def historico(self, request, codigo=None):
        """
        A trilha da oportunidade (RF12 / PB69, PB70).

        O Demandante nao ve as categorias internas: PB71 diz que ele acompanha
        o andamento "sem acessar informacoes internas restritas (ex.: resultados
        de matching, pre-analise detalhada)". O recorte e aqui, no servidor, e
        nao na tela.
        """
        oportunidade = self.get_object()

        eventos = EventoAuditoria.objects.filter(
            entidade='oportunidade', entidade_id=oportunidade.codigo
        ).order_by('-ocorrido_em')

        if request.user.papel == Papel.DEMANDANTE:
            eventos = eventos.filter(categoria__in=CATEGORIAS_VISIVEIS_AO_DEMANDANTE)

        return Response(EventoHistoricoSerializer(eventos, many=True).data)
