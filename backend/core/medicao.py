"""
Contadores de desempenho em memoria (plano 5.2).

Por que em memoria: a pagina de Saude existe para ser aberta durante um
incidente. Gravar uma linha por requisicao num Postgres que talvez seja a causa
do incidente transformaria o diagnostico em carga adicional. O preco e
conhecido e aceito: os numeros valem por processo e zeram no deploy.

O limite de 3 s nao e opiniao - e o critério de aceitacao da baseline
(`CONTEXT.md` secao 6). Daqui sai a evidencia dele.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

CAPACIDADE_DA_JANELA = 500


def percentil(amostras: list[float], fracao: float) -> float | None:
    """
    O percentil pelo metodo do vizinho mais proximo.

    Sem `numpy` de proposito: sao centenas de amostras, e importar o mundo para
    ordenar uma lista pequena custa mais que a conta.
    """
    if not amostras:
        return None

    ordenadas = sorted(amostras)
    indice = min(int(round(fracao * (len(ordenadas) - 1))), len(ordenadas) - 1)

    return round(ordenadas[indice], 1)


class MedidorDeRequisicoes:
    """Janela deslizante de latencias da API, protegida por trava."""

    def __init__(self, capacidade: int = CAPACIDADE_DA_JANELA) -> None:
        self._amostras: deque[float] = deque(maxlen=capacidade)
        self._trava = threading.Lock()
        self._inicio = time.time()
        self._total = 0
        self._erros = 0

    def registrar(self, *, duracao_ms: float, status: int) -> None:
        with self._trava:
            self._amostras.append(duracao_ms)
            self._total += 1

            if status >= 500:
                self._erros += 1

    def resumo(self, *, limite_ms: int) -> dict[str, Any]:
        with self._trava:
            amostras = list(self._amostras)
            total = self._total
            erros = self._erros
            inicio = self._inicio

        return {
            'requisicoes': total,
            'amostras': len(amostras),
            'p50_ms': percentil(amostras, 0.50),
            'p90_ms': percentil(amostras, 0.90),
            'limite_ms': limite_ms,
            'acima_do_limite': sum(1 for amostra in amostras if amostra > limite_ms),
            'erros_servidor': erros,
            'uptime_segundos': int(time.time() - inicio),
        }

    def zerar(self) -> None:
        """Usado pelos testes - nunca por codigo de producao."""
        with self._trava:
            self._amostras.clear()
            self._total = 0
            self._erros = 0
            self._inicio = time.time()


_medidor = MedidorDeRequisicoes()


def medidor() -> MedidorDeRequisicoes:
    """O medidor do processo."""
    return _medidor


_espera_de_ia_ms: ContextVar[float] = ContextVar('espera_de_ia_ms', default=0.0)


@contextmanager
def espera_de_ia():
    """
    Marca a espera por um servico externo de IA.

    O criterio dos 3 s desconsidera esse tempo (`CONTEXT.md` secao 6): o
    middleware desconta da requisicao o que passou aqui dentro.
    """
    inicio = time.perf_counter()

    try:
        yield
    finally:
        _espera_de_ia_ms.set(
            _espera_de_ia_ms.get() + (time.perf_counter() - inicio) * 1000
        )


def zerar_espera_de_ia() -> None:
    _espera_de_ia_ms.set(0.0)


def espera_de_ia_ms() -> float:
    return _espera_de_ia_ms.get()
