"""
Views de acesso.

A view recebe, delega e responde. Nenhum `if` de dominio mora aqui.
"""
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status, views, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.accounts.models import Usuario
from apps.accounts.permissoes import catalogo
from apps.accounts.serializers import (
    AlterarSenhaSerializer,
    EsqueciSenhaSerializer,
    LoginSerializer,
    PerfilSerializer,
    LogoutSerializer,
    RedefinirSenhaSerializer,
    SituacaoContaSerializer,
    UsuarioAdminSerializer,
)
from apps.accounts.services.acesso import (
    AlterarSenhaService,
    EncerrarSessaoService,
    RedefinirSenhaService,
    RegistrarAcessoService,
    SolicitarRecuperacaoSenhaService,
)
from apps.accounts.services.contas import (
    AlterarSituacaoContaService,
    ProvisionarContaService,
    ReenviarConviteService,
)
from core.permissions import EhAdministrador


class LoginView(TokenObtainPairView):
    """`POST /api/auth/token/` - par de tokens a partir de e-mail e senha."""

    permission_classes = [permissions.AllowAny]
    serializer_class = LoginSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)

        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            raise InvalidToken(exc.args[0]) from exc

        RegistrarAcessoService().execute(serializer.user)

        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class RefreshView(TokenRefreshView):
    """`POST /api/auth/token/refresh/`."""

    permission_classes = [permissions.AllowAny]


class PerfilView(views.APIView):
    """
    `GET /api/auth/profile/` - o usuario autenticado e o seu `papel`.

    E daqui que o front descobre qual dos quatro atores esta na sessao.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=PerfilSerializer)
    def get(self, request):
        return Response(PerfilSerializer(request.user).data)


class EsqueciSenhaView(views.APIView):
    """
    `POST /api/auth/forgot-password/`.

    Responde 200 exista ou nao a conta - ver `SolicitarRecuperacaoSenhaService`.
    """

    permission_classes = [permissions.AllowAny]

    @extend_schema(request=EsqueciSenhaSerializer, responses={200: None})
    def post(self, request):
        serializer = EsqueciSenhaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        SolicitarRecuperacaoSenhaService().execute(serializer.validated_data['email'])

        return Response(
            {
                'detail': (
                    'Se houver uma conta com este e-mail, enviamos um link de '
                    'redefinicao de senha.'
                )
            },
            status=status.HTTP_200_OK,
        )


class RedefinirSenhaView(views.APIView):
    """`POST /api/auth/reset-password/` - vale para recuperacao e primeiro acesso."""

    permission_classes = [permissions.AllowAny]

    @extend_schema(request=RedefinirSenhaSerializer, responses={200: None})
    def post(self, request):
        serializer = RedefinirSenhaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        RedefinirSenhaService().execute(
            serializer.validated_data['token'],
            serializer.validated_data['nova_senha'],
        )

        return Response(
            {'detail': 'Senha definida com sucesso.'}, status=status.HTTP_200_OK
        )


class AlterarSenhaView(views.APIView):
    """`POST /api/auth/change-password/` - troca de senha com a sessao ativa."""

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=AlterarSenhaSerializer, responses={200: None})
    def post(self, request):
        serializer = AlterarSenhaSerializer(
            data=request.data, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)

        AlterarSenhaService().execute(
            request.user, serializer.validated_data['nova_senha']
        )

        return Response(
            {'detail': 'Senha alterada com sucesso.'}, status=status.HTTP_200_OK
        )


class UsuarioViewSet(viewsets.ModelViewSet):
    """
    `/api/usuarios/` - administracao de contas.

    So o Administrador opera (`CONTEXT.md` secao 3). Ele provisiona quem opera
    a plataforma; quem faz ciencia entra pela rede interna, pelo Supervisor.
    """

    serializer_class = UsuarioAdminSerializer
    permission_classes = [permissions.IsAuthenticated, EhAdministrador]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        queryset = Usuario.objects.select_related('organizacao').order_by('nome')

        papel = self.request.query_params.get('papel')
        if papel:
            queryset = queryset.filter(papel=papel)

        situacao = self.request.query_params.get('situacao')
        if situacao:
            queryset = queryset.filter(situacao=situacao)

        busca = self.request.query_params.get('busca')
        if busca:
            queryset = queryset.filter(
                Q(nome__icontains=busca) | Q(email__icontains=busca)
            )

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        usuario = ProvisionarContaService().execute(
            nome=serializer.validated_data['nome'],
            email=serializer.validated_data['email'],
            papel=serializer.validated_data['papel'],
            organizacao=serializer.validated_data.get('organizacao'),
            ator=request.user,
        )

        return Response(
            self.get_serializer(usuario).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(request=SituacaoContaSerializer, responses=UsuarioAdminSerializer)
    @action(detail=True, methods=['post'], url_path='situacao',
            url_name='situacao')
    def situacao(self, request, pk=None):
        """Ativar, inativar ou suspender. Vale na requisicao seguinte."""
        serializer = SituacaoContaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        usuario = AlterarSituacaoContaService().execute(
            usuario=self.get_object(),
            situacao=serializer.validated_data['situacao'],
            ator=request.user,
        )

        return Response(self.get_serializer(usuario).data)

    @extend_schema(request=None, responses={200: None})
    @action(detail=True, methods=['post'], url_path='reenviar-convite',
            url_name='reenviar-convite')
    def reenviar_convite(self, request, pk=None):
        """Novo link de primeiro acesso. O anterior deixa de valer na hora."""
        ReenviarConviteService().execute(usuario=self.get_object(), ator=request.user)

        return Response({'detail': 'Convite reenviado.'}, status=status.HTTP_200_OK)


class CatalogoPermissoesView(views.APIView):
    """
    `GET /api/permissoes/catalogo/`.

    O front consome o catalogo em vez de espelhar a matriz de atores a mao.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: None})
    def get(self, request):
        return Response({'permissoes': catalogo()})


class LogoutView(views.APIView):
    """
    `POST /api/auth/logout/` - encerra a sessao de verdade.

    Limpar o token no navegador nao encerra sessao nenhuma: quem tiver copiado
    o refresh continua renovando o acesso ate ele expirar. Aqui o refresh entra
    na blacklist do SimpleJWT e para de valer na hora (PB02).
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=LogoutSerializer, responses={204: None})
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        EncerrarSessaoService().execute(
            refresh=serializer.validated_data['refresh'],
            usuario=request.user,
        )

        return Response(status=status.HTTP_204_NO_CONTENT)
