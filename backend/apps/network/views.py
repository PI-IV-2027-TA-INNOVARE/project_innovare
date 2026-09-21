"""
Views da rede interna.

A view recebe, delega e responde. Todo `if` de dominio mora nos services.
"""
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status, views, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.network.models import MembroRede, Titulacao
from apps.network.serializers import (
    LiberarAcessoSerializer,
    MembroRedeSerializer,
    PerfilProprioSerializer,
    TitulacaoSerializer,
)
from apps.network.services.rede import (
    AtualizarMembroService,
    AtualizarPerfilProprioService,
    CadastrarMembroService,
    LiberarAcessoMembroService,
)
from core.exceptions import RecursoNaoEncontrado
from core.permissions import EhSupervisor, TemPapel
from apps.accounts.models import Papel


class PodeConsultarRede(TemPapel):
    """`rede.consultar` da matriz: Supervisor e Pesquisador."""

    papeis_permitidos = (Papel.SUPERVISOR, Papel.PESQUISADOR)


LISTAS = ('competencias', 'tecnicas', 'linhas')


def separar_listas(validados):
    """Tira as tres listas do payload: elas nao sao campos do modelo."""
    return {campo: validados.pop(campo) for campo in LISTAS if campo in validados}


class MembroRedeViewSet(viewsets.ModelViewSet):
    """
    `/api/rede/` - a rede interna da AC2 (RF02).

    Consultar vale para Supervisor e Pesquisador; cadastrar e editar e so do
    Supervisor (RN-A04 / D06). Nao ha DELETE: quem sai da rede muda de
    `situacao`, e o historico de quem participou do que precisa do registro.
    """

    serializer_class = MembroRedeSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), PodeConsultarRede()]

        return [permissions.IsAuthenticated(), EhSupervisor()]

    def get_queryset(self):
        queryset = (
            MembroRede.objects
            .select_related('titulacao', 'organizacao', 'usuario')
            .prefetch_related('vinculos_competencia__competencia')
            .order_by('nome')
        )

        papel = self.request.query_params.get('papel_rede')
        if papel:
            queryset = queryset.filter(papel_rede=papel)

        situacao = self.request.query_params.get('situacao')
        if situacao:
            queryset = queryset.filter(situacao=situacao)

        disponibilidade = self.request.query_params.get('disponibilidade')
        if disponibilidade:
            queryset = queryset.filter(disponibilidade=disponibilidade)

        busca = self.request.query_params.get('busca')
        if busca:
            queryset = queryset.filter(
                Q(nome__icontains=busca)
                | Q(email__icontains=busca)
                | Q(vinculos_competencia__competencia__nome__icontains=busca)
            ).distinct()

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        validados = dict(serializer.validated_data)
        listas = separar_listas(validados)

        membro = CadastrarMembroService().execute(
            dados=validados, listas=listas, ator=request.user
        )

        return Response(
            self.get_serializer(membro).data, status=status.HTTP_201_CREATED
        )

    def partial_update(self, request, *args, **kwargs):
        membro = self.get_object()
        serializer = self.get_serializer(membro, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        validados = dict(serializer.validated_data)
        listas = separar_listas(validados)

        membro = AtualizarMembroService().execute(
            membro=membro, dados=validados, listas=listas, ator=request.user
        )

        return Response(self.get_serializer(membro).data)

    @extend_schema(request=LiberarAcessoSerializer, responses=MembroRedeSerializer)
    @action(detail=True, methods=['post'], url_path='liberar-acesso',
            url_name='liberar-acesso')
    def liberar_acesso(self, request, pk=None):
        """Cria a conta e envia o convite de primeiro acesso (PB08)."""
        membro = LiberarAcessoMembroService().execute(
            membro=self.get_object(), ator=request.user
        )

        return Response(self.get_serializer(membro).data)


class PerfilProprioView(views.APIView):
    """
    `/api/rede/meu-perfil/` - o perfil que o proprio membro mantem (RN-A05).

    Nao aceita `id`: o alvo e sempre quem esta autenticado. Rota com id abriria
    a porta para editar o perfil alheio por engano de permissao.
    """

    permission_classes = [permissions.IsAuthenticated]

    def _membro(self, request):
        membro = (
            MembroRede.objects
            .select_related('titulacao', 'organizacao')
            .prefetch_related('vinculos_competencia__competencia')
            .filter(usuario=request.user)
            .first()
        )

        if membro is None:
            raise RecursoNaoEncontrado(
                'Sua conta nao esta vinculada a um cadastro na rede interna.',
                codigo='sem_membro_rede',
            )

        return membro

    @extend_schema(responses=PerfilProprioSerializer)
    def get(self, request):
        return Response(PerfilProprioSerializer(self._membro(request)).data)

    @extend_schema(request=PerfilProprioSerializer, responses=PerfilProprioSerializer)
    def patch(self, request):
        membro = self._membro(request)
        serializer = PerfilProprioSerializer(membro, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        validados = dict(serializer.validated_data)
        listas = separar_listas(validados)

        membro = AtualizarPerfilProprioService().execute(
            membro=membro, dados=validados, listas=listas, ator=request.user
        )

        return Response(PerfilProprioSerializer(membro).data)


class TitulacaoListView(views.APIView):
    """
    `/api/rede/titulacoes/` - vocabulario controlado de titulacao.

    RF07 filtra "especialmente mestres e doutores", o que exige `nivel`
    comparavel. A tela consome esta lista em vez de espelhar as opcoes.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=TitulacaoSerializer(many=True))
    def get(self, request):
        return Response(
            TitulacaoSerializer(Titulacao.objects.all(), many=True).data
        )
