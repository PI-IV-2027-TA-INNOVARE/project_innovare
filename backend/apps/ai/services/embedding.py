"""
O modelo de embedding que roda no proprio servidor da API.

MiniLM multilingue (`SEARCH_EMBEDDING_MODEL`), que ja e dependencia: nao manda
texto para fora, nao tem custo por chamada e devolve vetores de 384 posicoes.
O modelo so e carregado na primeira chamada, uma vez por processo, porque
ocupa algumas centenas de MB de memoria.

A suite nunca chega aqui: com `SEARCH_EMBEDDING_ENABLED` desligado nos testes,
quem pede um provedor recebe a ausencia declarada (AGENTS.md 0.1).
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Sequence

from django.conf import settings

logger = logging.getLogger(__name__)


class ProvedorMiniLM:
    """Vetores normalizados de um lote de textos."""

    provedor = 'sentence-transformers'

    def __init__(self, modelo: str | None = None) -> None:
        self.modelo = modelo or settings.SEARCH_EMBEDDING_MODEL
        self._carregado = None
        self._falhou = False

    @property
    def disponivel(self) -> bool:
        return not self._falhou

    def _modelo(self):
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
