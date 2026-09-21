"""
Autenticacao JWT com verificacao de situacao a cada requisicao.

Sem isto, `situacao = suspenso` so vale no proximo login: o access token que a
pessoa ja tem continua valendo ate expirar. A tela Admin - Usuarios e acessos
oferece "suspender" como acao imediata, e o backend precisa honrar isso.
"""
from django.utils.translation import gettext_lazy as _
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class AutenticacaoJWTComSituacao(JWTAuthentication):
    def get_user(self, validated_token):
        usuario = super().get_user(validated_token)

        if usuario.situacao != 'ativo':
            raise AuthenticationFailed(
                _('Esta conta esta %(situacao)s. Procure a administracao da '
                  'plataforma.') % {'situacao': usuario.get_situacao_display().lower()},
                code='conta_nao_ativa',
            )

        return usuario
