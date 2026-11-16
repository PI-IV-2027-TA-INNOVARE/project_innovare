"""
Avisos do `manage.py check --deploy` que sao deste projeto.
"""
from django.conf import settings
from django.core.checks import Tags, Warning, register

from core.configuracao import CACHE_EM_MEMORIA


@register(Tags.security, deploy=True)
def cache_compartilhado_em_producao(app_configs, **kwargs):
    """
    Producao com o cache na memoria do processo.

    Os limites de pedidos contam no cache. Com mais de um processo atendendo,
    cada um conta o seu, e a trava de tentativa de senha vale o configurado
    vezes o numero de processos.
    """
    if not settings.EM_PRODUCAO:
        return []

    if settings.CACHES['default']['BACKEND'] != CACHE_EM_MEMORIA:
        return []

    return [
        Warning(
            'Os limites de pedidos contam na memoria de cada processo.',
            hint=(
                'Defina CACHE_URL com o endereco de um Redis, para o contador '
                'ser um so entre os processos do servidor.'
            ),
            id='pdconnect.W001',
        )
    ]
