"""
Trabalho que nao precisa segurar a resposta.

O e-mail de recuperacao de senha saia dentro do pedido: a resposta demorava o
tempo do SMTP so quando a conta existia, e o tempo contava o que o texto da
resposta esconde. Aqui a tarefa vai para uma fila curta de threads do proprio
processo, e quem chamou responde na hora.

Nao e a fila do Celery: essa e opcional, e o e-mail de recuperacao tem de sair
tambem sem ela. O que precisa sobreviver a queda do processo continua indo
para o worker.

Na suite a tarefa roda na hora (`SEGUNDO_PLANO_IMEDIATO`), como o Celery em
modo eager.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

from django.conf import settings
from django.db import connections

logger = logging.getLogger(__name__)

THREADS = 2

_fila = ThreadPoolExecutor(max_workers=THREADS, thread_name_prefix='segundo-plano')


def _rodar(tarefa: Callable[..., Any], args: tuple, kwargs: dict) -> None:
    try:
        tarefa(*args, **kwargs)
    except Exception:
        logger.exception('Tarefa em segundo plano falhou.')
    finally:
        connections.close_all()


def em_segundo_plano(tarefa: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
    if settings.SEGUNDO_PLANO_IMEDIATO:
        tarefa(*args, **kwargs)
        return

    _fila.submit(_rodar, tarefa, args, kwargs)
