"""
Contratos de fronteira do acesso.

Serializer valida e desenha o contrato; nao decide regra de negocio - isso e
dos servicos em `apps/accounts/services/` (AGENTS.md secao 1).
"""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.accounts.models import Papel, SituacaoConta, Usuario


class OrganizacaoResumoSerializer(serializers.Serializer):
    """Vinculo institucional na resposta do perfil - leitura apenas."""

    id_organizacao = serializers.IntegerField(read_only=True)
    nome = serializers.CharField(read_only=True)
    tipo = serializers.CharField(read_only=True)


class LoginSerializer(TokenObtainPairSerializer):
    """
    Par de tokens.

    O campo de credencial e `email` (USERNAME_FIELD), que e o que o front ja
    envia em `requestAuthToken`.
    """

    @classmethod
    def get_token(cls, usuario):
        token = super().get_token(usuario)
        token['papel'] = usuario.papel
        token['nome'] = usuario.nome
        return token

    def validate(self, attrs):
        credencial = attrs.get(self.username_field)
        if credencial:
            attrs[self.username_field] = credencial.strip().lower()

        dados = super().validate(attrs)
        dados['papel'] = self.user.papel
        return dados


class PerfilSerializer(serializers.ModelSerializer):
    """
    Resposta de `GET /auth/profile/`.

    `papel` e o campo que o front usa para escolher rota e menu; `permissoes`
    e o catalogo efetivo, para que a UI nao espelhe a matriz a mao.
    """

    organizacao = OrganizacaoResumoSerializer(read_only=True)
    papel_rotulo = serializers.CharField(source='get_papel_display', read_only=True)
    situacao_rotulo = serializers.CharField(
        source='get_situacao_display', read_only=True
    )
    permissoes = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = [
            'id_usuario',
            'nome',
            'email',
            'papel',
            'papel_rotulo',
            'situacao',
            'situacao_rotulo',
            'organizacao',
            'ultimo_acesso',
            'criado_em',
            'permissoes',
        ]
        read_only_fields = fields

    def get_permissoes(self, usuario):
        from apps.accounts.permissoes import permissoes_do_papel

        return permissoes_do_papel(usuario.papel)


class EsqueciSenhaSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, valor):
        return valor.strip().lower()


class RedefinirSenhaSerializer(serializers.Serializer):
    token = serializers.CharField()
    nova_senha = serializers.CharField(write_only=True, min_length=8)
    confirmar_senha = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs['nova_senha'] != attrs['confirmar_senha']:
            raise serializers.ValidationError(
                {'confirmar_senha': 'As senhas nao coincidem.'}
            )

        try:
            validate_password(attrs['nova_senha'])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'nova_senha': list(exc.messages)})

        return attrs


class AlterarSenhaSerializer(serializers.Serializer):
    senha_atual = serializers.CharField(write_only=True)
    nova_senha = serializers.CharField(write_only=True, min_length=8)
    confirmar_senha = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs['nova_senha'] != attrs['confirmar_senha']:
            raise serializers.ValidationError(
                {'confirmar_senha': 'As senhas nao coincidem.'}
            )

        usuario = self.context['request'].user

        if not usuario.check_password(attrs['senha_atual']):
            raise serializers.ValidationError({'senha_atual': 'Senha atual incorreta.'})

        try:
            validate_password(attrs['nova_senha'], user=usuario)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'nova_senha': list(exc.messages)})

        return attrs


class UsuarioAdminSerializer(serializers.ModelSerializer):
    """
    Contrato do CRUD do Administrador (tela Admin - Usuarios e acessos).

    `senha` nao entra: a conta provisionada nasce sem senha utilizavel e a
    pessoa a define pelo token de convite (RN-A04).

    `situacao` e somente leitura aqui de proposito. Ativar, inativar e suspender
    tem rota propria (`POST /usuarios/{id}/situacao/`), que audita a transicao;
    deixar a coluna editavel no `PATCH` criaria um segundo caminho sem trilha.
    """

    papel_rotulo = serializers.CharField(source='get_papel_display', read_only=True)
    situacao_rotulo = serializers.CharField(
        source='get_situacao_display', read_only=True
    )
    instituicao = serializers.CharField(
        source='organizacao.nome', read_only=True, default=None
    )
    aguardando_primeiro_acesso = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = [
            'id_usuario',
            'nome',
            'email',
            'papel',
            'papel_rotulo',
            'situacao',
            'situacao_rotulo',
            'organizacao',
            'instituicao',
            'ultimo_acesso',
            'aguardando_primeiro_acesso',
            'criado_em',
            'atualizado_em',
        ]
        read_only_fields = [
            'id_usuario',
            'situacao',
            'ultimo_acesso',
            'criado_em',
            'atualizado_em',
        ]

    def get_aguardando_primeiro_acesso(self, usuario):
        return not usuario.has_usable_password()

    def validate_papel(self, valor):
        if valor not in Papel.values:
            raise serializers.ValidationError(
                'Papel fora dos quatro atores da baseline.'
            )

        if valor == Papel.PESQUISADOR:
            raise serializers.ValidationError(
                'Conta de Pesquisador nasce do cadastro na rede interna, pelo '
                'Supervisor. Use a rede interna, nao esta rota.'
            )

        return valor

    def validate_email(self, valor):
        return valor.strip().lower()


class SituacaoContaSerializer(serializers.Serializer):
    """Corpo de `POST /usuarios/{id}/situacao/`."""

    situacao = serializers.ChoiceField(choices=SituacaoConta.choices)


class LogoutSerializer(serializers.Serializer):
    """Recebe o refresh que deve deixar de valer."""

    refresh = serializers.CharField()
