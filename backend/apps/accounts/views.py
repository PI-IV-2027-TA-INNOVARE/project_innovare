"""
Views de acesso.

A view recebe, delega e responde. Nenhum `if` de dominio mora aqui.
"""
from django.db.models import CharField, OuterRef, Q, Subquery
from django.db.models.functions import Cast
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status, views, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.accounts.cookie_de_sessao import (
    apagar_renovacao,
    gravar_renovacao,
    origem_confiavel,
    renovacao_do_pedido,
)
from apps.accounts.models import Usuario
from apps.audit.models import EventoAuditoria
from apps.accounts.permissoes import catalogo
from apps.accounts.serializers import (
    AlterarSenhaSerializer,
    ConsultaEmpresaSerializer,
    EmpresaSerializer,
    EsqueciSenhaSerializer,
    LoginSerializer,
    PedidoDeExclusaoSerializer,
    PerfilSerializer,
    LogoutSerializer,
    RedefinirSenhaSerializer,
    SituacaoContaSerializer,
    TelefoneDoDemandanteSerializer,
    UsuarioAdminSerializer,
)
from apps.accounts.services.acesso import (
    AlterarSenhaService,
    EncerrarSessaoService,
    RedefinirSenhaService,
    RegistrarAcessoService,
    SolicitarRecuperacaoSenhaService,
)
from apps.accounts.services.titular import (
    AnonimizarContaService,
    SolicitarExclusaoService,
    copia_dos_dados,
    pedido_de_exclusao,
)
from apps.accounts.services.contas import (
    AlterarSituacaoContaService,
    AtualizarContaService,
    AtualizarTelefoneService,
    ProvisionarContaService,
    ReenviarConviteService,
)
from apps.organizations.services.empresas import buscar_empresa_demandante
from core.permissions import EhAdministrador


def _exigir_origem_confiavel(request) -> None:
    if not origem_confiavel(request):
        raise PermissionDenied('Pedido de outra origem.')


class LoginView(TokenObtainPairView):
    """
    `POST /api/auth/token/` - entrada com e-mail e senha.

    O token de acesso volta no corpo; o de renovacao, so no cookie que o
    JavaScript nao le (`cookie_de_sessao`).

    So aceita JSON e de origem confiavel: um formulario de outro site poderia
    entrar com a conta de quem o montou e deixar o cookie dela no navegador da
    vitima, que passaria a trabalhar na conta errada.
    """

    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser]
    serializer_class = LoginSerializer
    throttle_scope = 'login'

    def post(self, request, *args, **kwargs):
        _exigir_origem_confiavel(request)
        serializer = self.get_serializer(data=request.data)

        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            raise InvalidToken(exc.args[0]) from exc

        RegistrarAcessoService().execute(serializer.user)

        dados = dict(serializer.validated_data)
        refresh = dados.pop('refresh')
        resposta = Response(dados, status=status.HTTP_200_OK)
        gravar_renovacao(resposta, refresh)
        return resposta


class RefreshView(TokenRefreshView):
    """
    `POST /api/auth/token/refresh/` - novo token de acesso.

    O navegador manda o token de renovacao no cookie, e o novo volta no cookie.
    Cliente de API que manda no corpo recebe no corpo: nao ha cookie para ele.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        do_corpo = request.data.get('refresh') if hasattr(request.data, 'get') else None

        if not do_corpo:
            _exigir_origem_confiavel(request)

        refresh = do_corpo or renovacao_do_pedido(request)

        if not refresh:
            raise InvalidToken('Sessão não encontrada. Entre novamente.')

        serializer = self.get_serializer(data={'refresh': refresh})

        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            raise InvalidToken(exc.args[0]) from exc

        dados = dict(serializer.validated_data)
        novo = dados.get('refresh') if do_corpo else dados.pop('refresh', None)
        resposta = Response(dados, status=status.HTTP_200_OK)

        if novo and not do_corpo:
            gravar_renovacao(resposta, novo)

        return resposta


class PerfilView(views.APIView):
    """
    `GET /api/auth/profile/` - o usuario autenticado e o seu `papel`.

    E daqui que o front descobre qual dos quatro atores esta na sessao.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=PerfilSerializer)
    def get(self, request):
        return Response(PerfilSerializer(request.user).data)

    @extend_schema(request=TelefoneDoDemandanteSerializer, responses=PerfilSerializer)
    def patch(self, request):
        """O Demandante Externo mantem o proprio telefone de contato."""
        serializer = TelefoneDoDemandanteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        AtualizarTelefoneService().execute(
            usuario=request.user,
            telefone=serializer.validated_data['telefone'],
            ator=request.user,
        )

        return Response(PerfilSerializer(request.user).data)


class MeusDadosView(views.APIView):
    """
    `GET /api/auth/meus-dados/` - a copia do que o sistema guarda sobre a pessoa.

    Direito do titular (LGPD, art. 18). Sai como arquivo para baixar.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: None})
    def get(self, request):
        return Response(
            copia_dos_dados(request.user),
            headers={
                'Content-Disposition': 'attachment; filename="meus-dados.json"',
                'Cache-Control': 'no-store',
            },
        )


class ExclusaoDosMeusDadosView(views.APIView):
    """
    `/api/auth/meus-dados/exclusao/` - o pedido de exclusao da propria conta.

    `GET` diz se ja ha pedido; `POST` faz o pedido, que o Administrador ve na
    lista de Usuarios e atende anonimizando a conta.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=PedidoDeExclusaoSerializer)
    def get(self, request):
        evento = pedido_de_exclusao(request.user)

        return Response(
            PedidoDeExclusaoSerializer({'solicitada_em': evento.ocorrido_em if evento else None}).data
        )

    @extend_schema(request=None, responses=PedidoDeExclusaoSerializer)
    def post(self, request):
        evento = SolicitarExclusaoService().execute(usuario=request.user)

        return Response(
            PedidoDeExclusaoSerializer({'solicitada_em': evento.ocorrido_em}).data,
            status=status.HTTP_201_CREATED,
        )


class EsqueciSenhaView(views.APIView):
    """
    `POST /api/auth/forgot-password/`.

    Responde 200 exista ou nao a conta - ver `SolicitarRecuperacaoSenhaService`.
    """

    permission_classes = [permissions.AllowAny]
    throttle_scope = 'recuperacao'

    @extend_schema(request=EsqueciSenhaSerializer, responses={200: None})
    def post(self, request):
        serializer = EsqueciSenhaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        SolicitarRecuperacaoSenhaService().execute(serializer.validated_data['email'])

        return Response(
            {
                'detail': (
                    'Se houver uma conta com este e-mail, enviamos um link de '
                    'redefinição de senha.'
                )
            },
            status=status.HTTP_200_OK,
        )


class RedefinirSenhaView(views.APIView):
    """`POST /api/auth/reset-password/` - vale para recuperacao e primeiro acesso."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = 'redefinicao'

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

        resposta = Response(
            {'detail': 'Senha alterada com sucesso.'}, status=status.HTTP_200_OK
        )
        gravar_renovacao(resposta, str(RefreshToken.for_user(request.user)))
        return resposta


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
        pedidos = EventoAuditoria.objects.filter(
            tipo='exclusao_solicitada',
            entidade='usuario',
            entidade_id=Cast(OuterRef('pk'), CharField()),
        ).order_by('-ocorrido_em')

        queryset = Usuario.objects.select_related(
            'organizacao', 'perfil_demandante'
        ).annotate(
            exclusao_solicitada_em=Subquery(pedidos.values('ocorrido_em')[:1])
        ).order_by('nome')

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

    def partial_update(self, request, *args, **kwargs):
        usuario = self.get_object()
        serializer = self.get_serializer(usuario, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        AtualizarContaService().execute(
            usuario=usuario, dados=serializer.validated_data, ator=request.user
        )

        return Response(self.get_serializer(usuario).data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        usuario = ProvisionarContaService().execute(
            nome=serializer.validated_data.get('nome', ''),
            email=serializer.validated_data['email'],
            papel=serializer.validated_data['papel'],
            organizacao=serializer.validated_data.get('organizacao'),
            cnpj=serializer.validated_data.get('cnpj'),
            nome_empresa=serializer.validated_data.get('nome_empresa', ''),
            ator=request.user,
        )

        return Response(
            self.get_serializer(usuario).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(parameters=[ConsultaEmpresaSerializer], responses=EmpresaSerializer)
    @action(detail=False, methods=['get'], url_path='empresa', url_name='empresa')
    def empresa(self, request):
        """A empresa demandante do CNPJ, para preencher o nome no cadastro."""
        serializer = ConsultaEmpresaSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        empresa = buscar_empresa_demandante(serializer.validated_data['cnpj'])

        return Response(EmpresaSerializer(empresa).data)

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

    @extend_schema(request=None, responses=UsuarioAdminSerializer)
    @action(detail=True, methods=['post'], url_path='anonimizar', url_name='anonimizar')
    def anonimizar(self, request, pk=None):
        """
        Atende o pedido de exclusao (LGPD, art. 18): a conta deixa de
        identificar a pessoa, e a trilha passa a dizer "pessoa removida".
        """
        usuario = AnonimizarContaService().execute(usuario=self.get_object(), ator=request.user)

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
    na blacklist do SimpleJWT e para de valer na hora (PB02), e o cookie sai.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=LogoutSerializer, responses={204: None})
    def post(self, request):
        _exigir_origem_confiavel(request)
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        refresh = serializer.validated_data.get('refresh') or renovacao_do_pedido(request)

        if refresh:
            EncerrarSessaoService().execute(refresh=refresh, usuario=request.user)

        resposta = Response(status=status.HTTP_204_NO_CONTENT)
        apagar_renovacao(resposta)
        return resposta
