"""
O modelo de embedding que roda no proprio servidor da API.

MiniLM multilingue (`SEARCH_EMBEDDING_MODEL`), que ja e dependencia: nao manda
texto para fora, nao tem custo por chamada e devolve vetores de 384 posicoes.
O modelo e carregado uma vez por processo, porque ocupa algumas centenas de MB
de memoria. O servidor o aquece ao subir (`aquecer_em_segundo_plano`); sem
isso, a primeira rodada de matching esperava a carga inteira.

A suite nunca chega aqui: com `SEARCH_EMBEDDING_ENABLED` desligado nos testes,
quem pede um provedor recebe a ausencia declarada (AGENTS.md 0.1).
"""
from __future__ import annotations

import logging
import threading
from functools import lru_cache
from typing import Mapping, Sequence

from django.conf import settings

logger = logging.getLogger(__name__)


class ProvedorMiniLM:
    """Vetores normalizados de um lote de textos."""

    provedor = 'sentence-transformers'

    def __init__(self, modelo: str | None = None) -> None:
        self.modelo = modelo or settings.SEARCH_EMBEDDING_MODEL
        self._carregado = None
        self._falhou = False
        self._carga = threading.Lock()

    @property
    def disponivel(self) -> bool:
        return not self._falhou

    def _modelo(self):
        with self._carga:
            if self._carregado is None:
                from sentence_transformers import SentenceTransformer

                self._carregado = SentenceTransformer(self.modelo)

        return self._carregado

    def vetores(self, textos: Sequence[str]) -> list[list[float]]:
        try:
            calculados = self._modelo().encode(
                list(textos), normalize_embeddings=True, show_progress_bar=False
            )
        except Exception:
            self._falhou = True
            logger.exception('Modelo de embedding indisponivel.')
            raise

        return [[float(valor) for valor in vetor] for vetor in calculados]


@lru_cache(maxsize=1)
def provedor_minilm() -> ProvedorMiniLM:
    """Um modelo por processo: carregar de novo a cada rodada custaria segundos."""
    return ProvedorMiniLM()


def aquecer_modelo() -> bool:
    """
    Carrega o modelo antes da primeira rodada de matching.

    A falha nao derruba o servidor: fica no registro, e a rodada segue com o
    fallback que ja existe quando o modelo nao responde.
    """
    if not settings.SEARCH_EMBEDDING_ENABLED:
        return False

    try:
        provedor_minilm().vetores(['aquecimento'])
    except Exception:
        logger.warning('O modelo de embedding nao carregou no aquecimento.', exc_info=True)
        return False

    return True


def aquecer_em_segundo_plano() -> threading.Thread:
    """O aquecimento numa thread propria: o servidor atende enquanto o modelo carrega."""
    linha = threading.Thread(target=aquecer_modelo, name='aquecer-embedding', daemon=True)
    linha.start()
    return linha


def deve_aquecer(argv: Sequence[str], ambiente: Mapping[str, str]) -> bool:
    """
    So o processo do `runserver` que atende pedidos.

    Com o recarregamento automatico, o `runserver` sobe dois processos, e so o
    filho (`RUN_MAIN`) atende. `test`, `migrate` e os demais comandos nao
    precisam do modelo.
    """
    if 'runserver' not in argv:
        return False

    return ambiente.get('RUN_MAIN') == 'true' or '--noreload' in argv
