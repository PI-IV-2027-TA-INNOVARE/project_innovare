"""
Cache no Redis que nao derruba a API quando o Redis cai.

O cache guarda os contadores dos limites de pedidos, e todo pedido passa por
ele. Com o backend do Django, Redis fora do ar vira erro 500 em todas as rotas:
o que era protecao viraria a queda. Aqui a falha vai para o log, a leitura
devolve o padrao e a gravacao nao acontece - o limite deixa de contar ate o
Redis voltar, e a API segue atendendo.
"""
from __future__ import annotations

import logging

from django.core.cache.backends.redis import RedisCache
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


class RedisTolerante(RedisCache):
    def get(self, key, default=None, version=None):
        try:
            return super().get(key, default, version)
        except RedisError:
            logger.exception('Cache fora do ar na leitura; os limites de pedidos nao contam.')
            return default

    def set(self, key, value, timeout=None, version=None, **kwargs):
        argumentos = {} if timeout is None else {'timeout': timeout}

        try:
            super().set(key, value, version=version, **argumentos, **kwargs)
        except RedisError:
            logger.exception('Cache fora do ar na gravacao; os limites de pedidos nao contam.')

    def add(self, key, value, timeout=None, version=None, **kwargs):
        argumentos = {} if timeout is None else {'timeout': timeout}

        try:
            return super().add(key, value, version=version, **argumentos, **kwargs)
        except RedisError:
            logger.exception('Cache fora do ar na gravacao; os limites de pedidos nao contam.')
            return False

    def delete(self, key, version=None):
        try:
            return super().delete(key, version)
        except RedisError:
            logger.exception('Cache fora do ar na remocao.')
            return False
