"""
A autenticacao JWT do projeto na documentacao da API.

`AutenticacaoJWTComSituacao` estende a do SimpleJWT e o drf-spectacular nao a
reconhece sozinho; sem esta extensao cada rota sai sem o esquema de seguranca.
"""
from drf_spectacular.contrib.rest_framework_simplejwt import SimpleJWTScheme


class EsquemaJWTComSituacao(SimpleJWTScheme):
    target_class = 'apps.accounts.authentication.AutenticacaoJWTComSituacao'
    name = 'jwtAuth'
