"""
Middleware de medicao (plano 5.2).

Mede e segue. Qualquer falha aqui e engolida de proposito: um contador de
observabilidade que derruba a resposta e pior que nao ter contador.
"""
from __future__ import annotations

import time

from core.medicao import espera_de_ia_ms, medidor, zerar_espera_de_ia

PREFIXO_MEDIDO = '/api/'


class MedidorDeDesempenho:
    """
    Latencia por requisicao da API, em memoria, sem tocar o banco.

    A espera por servico externo de IA sai da conta: o criterio dos 3 s a
    desconsidera (`CONTEXT.md` secao 6).
    """

    def __init__(self, get_response) -> None:
        self._get_response = get_response

    def __call__(self, request):
        if not request.path.startswith(PREFIXO_MEDIDO):
            return self._get_response(request)

        zerar_espera_de_ia()
        inicio = time.perf_counter()
        resposta = self._get_response(request)

        try:
            total_ms = (time.perf_counter() - inicio) * 1000
            medidor().registrar(
                duracao_ms=max(total_ms - espera_de_ia_ms(), 0),
                status=getattr(resposta, 'status_code', 0),
            )
        except Exception:
            pass

        return resposta
