"""
Contratos de fronteira do acesso.

Serializer valida e desenha o contrato; nao decide regra de negocio - isso e
dos servicos em `apps/accounts/services/` (AGENTS.md secao 1).
"""
from datetime import datetime

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.accounts.models import DemandanteExterno, Papel, SituacaoConta, Usuario
from apps.accounts.services.titular import anonimizada
from apps.accounts.telefone import formatar_telefone, telefone_valido
from apps.organizations.cnpj import cnpj_valido, formatar_cnpj, somente_digitos
from apps.organizations.models import Organizacao, TipoOrganizacao


def telefone_do_demandante(usuario: Usuario) -> str | None:
    """O telefone de contato, formatado. So o Demandante Externo tem um."""
    if usuario.papel != Papel.DEMANDANTE:
        return None

    try:
        return formatar_telefone(usuario.perfil_demandante.telefone)
    except DemandanteExterno.DoesNotExist:
        return ''


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
    telefone = serializers.SerializerMethodField()

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
            'telefone',
            'ultimo_acesso',
            'criado_em',
            'permissoes',
        ]
        read_only_fields = fields

    def get_permissoes(self, usuario) -> list[str]:
        from apps.accounts.permissoes import permissoes_do_papel

        return permissoes_do_papel(usuario.papel)

    def get_telefone(self, usuario) -> str | None:
        return telefone_do_demandante(usuario)


class TelefoneDoDemandanteSerializer(serializers.Serializer):
    """Corpo de `PATCH /auth/profile/`: o telefone de contato do Demandante."""

    telefone = serializers.CharField(allow_blank=True, max_length=20)

    def validate_telefone(self, valor):
        if not telefone_valido(valor):
            raise serializers.ValidationError(
                'Telefone incompleto. Informe o DDD e o número, como (19) 99876-5432.'
            )

        return somente_digitos(valor)


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
                {'confirmar_senha': 'As senhas não coincidem.'}
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
                {'confirmar_senha': 'As senhas não coincidem.'}
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

    nome = serializers.CharField(max_length=160, required=False, allow_blank=True)
    papel_rotulo = serializers.CharField(source='get_papel_display', read_only=True)
    situacao_rotulo = serializers.CharField(
        source='get_situacao_display', read_only=True
    )
    instituicao = serializers.CharField(
        source='organizacao.nome', read_only=True, default=None
    )
    aguardando_primeiro_acesso = serializers.SerializerMethodField()
    exclusao_solicitada_em = serializers.SerializerMethodField()
    anonimizada = serializers.SerializerMethodField()
    cnpj = serializers.CharField(required=False, allow_blank=True, write_only=True)
    nome_empresa = serializers.CharField(
        required=False, allow_blank=True, write_only=True, max_length=180
    )

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
            'exclusao_solicitada_em',
            'anonimizada',
            'cnpj',
            'nome_empresa',
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

    def get_aguardando_primeiro_acesso(self, usuario) -> bool:
        return not usuario.has_usable_password() and not anonimizada(usuario)

    def get_exclusao_solicitada_em(self, usuario) -> datetime | None:
        return getattr(usuario, 'exclusao_solicitada_em', None)

    def get_anonimizada(self, usuario) -> bool:
        return anonimizada(usuario)

    def to_representation(self, usuario):
        dados = super().to_representation(usuario)
        empresa = usuario.organizacao if usuario.papel == Papel.DEMANDANTE else None

        dados['cnpj'] = formatar_cnpj(empresa.cnpj) if empresa else None
        dados['telefone'] = telefone_do_demandante(usuario)
        return dados

    def validate(self, attrs):
        """
        O formulario muda com o perfil.

        Demandante Externo: CNPJ, nome da empresa e e-mail - o nome da conta e o
        da empresa. Os outros perfis: nome e e-mail, sem empresa.
        """
        papel = attrs.get('papel', getattr(self.instance, 'papel', None))
        cnpj = attrs.pop('cnpj', None)
        nome_empresa = attrs.pop('nome_empresa', None)

        if papel != Papel.DEMANDANTE:
            if cnpj or nome_empresa:
                raise serializers.ValidationError(
                    {'cnpj': 'CNPJ e nome da empresa valem só para o Demandante Externo.'}
                )

            if self.instance is None and not (attrs.get('nome') or '').strip():
                raise serializers.ValidationError({'nome': 'Informe o nome.'})

            return attrs

        virou_demandante = (
            self.instance is not None and self.instance.papel != Papel.DEMANDANTE
        )
        pede_empresa = (
            self.instance is None
            or virou_demandante
            or cnpj is not None
            or nome_empresa is not None
        )

        if not pede_empresa:
            return attrs

        if not (cnpj or '').strip():
            raise serializers.ValidationError({'cnpj': 'Informe o CNPJ da empresa.'})

        if not cnpj_valido(cnpj):
            raise serializers.ValidationError(
                {'cnpj': 'CNPJ inválido. Confira os 14 números.'}
            )

        digitos = somente_digitos(cnpj)
        nome_empresa = (nome_empresa or '').strip()
        ja_cadastrada = Organizacao.objects.filter(
            cnpj=digitos, tipo=TipoOrganizacao.DEMANDANTE
        ).exists()

        if not nome_empresa and not ja_cadastrada:
            raise serializers.ValidationError(
                {'nome_empresa': 'Informe o nome da empresa.'}
            )

        attrs['cnpj'] = digitos
        attrs['nome_empresa'] = nome_empresa
        return attrs

    def validate_papel(self, valor):
        if valor not in Papel.values:
            raise serializers.ValidationError(
                'Escolha um perfil da lista.'
            )

        if valor == Papel.PESQUISADOR:
            raise serializers.ValidationError(
                'Conta de Pesquisador nasce do cadastro na rede interna, feito '
                'pelo Supervisor. Use a rede interna.'
            )

        return valor

    def validate_email(self, valor):
        return valor.strip().lower()


class ConsultaEmpresaSerializer(serializers.Serializer):
    """Parametro de `GET /usuarios/empresa/?cnpj=`."""

    cnpj = serializers.CharField()

    def validate_cnpj(self, valor):
        if not cnpj_valido(valor):
            raise serializers.ValidationError('CNPJ inválido. Confira os 14 números.')

        return somente_digitos(valor)


class EmpresaSerializer(serializers.Serializer):
    """A empresa demandante encontrada pelo CNPJ."""

    id_organizacao = serializers.IntegerField(read_only=True)
    nome = serializers.CharField(read_only=True)
    cnpj = serializers.SerializerMethodField()

    def get_cnpj(self, empresa) -> str | None:
        return formatar_cnpj(empresa.cnpj)


class SituacaoContaSerializer(serializers.Serializer):
    """Corpo de `POST /usuarios/{id}/situacao/`."""

    situacao = serializers.ChoiceField(choices=SituacaoConta.choices)


class PedidoDeExclusaoSerializer(serializers.Serializer):
    """Quando a pessoa pediu a exclusao da propria conta, se pediu."""

    solicitada_em = serializers.DateTimeField(allow_null=True, read_only=True)


class LogoutSerializer(serializers.Serializer):
    """
    O refresh que deve deixar de valer.

    O navegador nao manda nada aqui: o refresh dele vem no cookie.
    """

    refresh = serializers.CharField(required=False, allow_blank=True)
