"""
Middleware de medicao (plano 5.2).

Mede e segue. Qualquer falha aqui e engolida de proposito: um contador de
observabilidade que derruba a resposta e pior que nao ter contador.
"""
from __future__ import annotations

import time

from django.conf import settings

from core.medicao import medidor

PREFIXO_MEDIDO = '/api/'


class MedidorDeDesempenho:
    """Latencia por requisicao da API, em memoria, sem tocar o banco."""

    def __init__(self, get_response) -> None:
        self._get_response = get_response

    def __call__(self, request):
        if not request.path.startswith(PREFIXO_MEDIDO):
            return self._get_response(request)

        inicio = time.perf_counter()
        resposta = self._get_response(request)

        try:
            medidor().registrar(
                duracao_ms=(time.perf_counter() - inicio) * 1000,
                status=getattr(resposta, 'status_code', 0),
                limite_ms=int(settings.DESEMPENHO_LIMITE_MS),
            )
        except Exception:
            pass

        return resposta
