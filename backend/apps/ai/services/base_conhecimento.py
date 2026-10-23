"""
Leitura da Base de Conhecimento PIPE (`IA/Colinha_IA_PIPE_*.json`).

De onde vem o conteudo que o Copiloto e a pre-analise usam: as perguntas
orientadoras (RF04) e os criterios de referencia (RF09). O arquivo e a baseline
do modulo de IA - `IA/README.md` o descreve e o versiona. Nada aqui inventa
pergunta nem criterio: o que nao esta no arquivo nao existe para o sistema.

Degrada como o provedor de IA degrada (AGENTS.md 0.2): arquivo ausente ou
ilegivel nasce `disponivel = False` e quem chama explica a ausencia na tela, em
vez de improvisar conteudo de fomento.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

from django.conf import settings

logger = logging.getLogger(__name__)

VERSAO_DESCONHECIDA = '?'


class BaseConhecimentoPIPE:
    """O JSON da baseline, lido uma vez e consultado por secao."""

    def __init__(self, caminho: Path | None = None) -> None:
        self._caminho = Path(caminho or settings.BASE_CONHECIMENTO_PIPE)
        self._dados: dict[str, Any] = {}

        try:
            with self._caminho.open(encoding='utf-8') as arquivo:
                self._dados = json.load(arquivo)
        except FileNotFoundError:
            logger.warning(
                'Base de Conhecimento PIPE nao encontrada em %s.', self._caminho
            )
        except (json.JSONDecodeError, OSError) as erro:
            logger.error('Base de Conhecimento PIPE ilegivel: %s', erro)

    @property
    def disponivel(self) -> bool:
        return bool(self._dados)

    @property
    def caminho(self) -> Path:
        return self._caminho

    @property
    def baseline_id(self) -> str:
        return self._dados.get('metadata', {}).get('baseline_id', VERSAO_DESCONHECIDA)

    @property
    def versao(self) -> str:
        """
        A versao ATIVA da secao `versioning`.

        `VersaoCriterio.versao` tem 12 caracteres e o `baseline_id` tem 21: o
        rotulo curto (`V2`) e o que identifica a versao, e o `baseline_id`
        completo fica ao lado, em `VersaoCriterio.baseline`.
        """
        for registro in self._dados.get('versioning', []):
            if str(registro.get('status', '')).upper().startswith('ATIVA'):
                return str(registro.get('version', VERSAO_DESCONHECIDA))[:12]

        return VERSAO_DESCONHECIDA

    def criterios(self) -> list[dict[str, Any]]:
        """Os criterios da secao 8.5 da chamada, como estao no arquivo."""
        return list(self._dados.get('criteria_8_5', []))

    def perguntas(
        self,
        campos: Iterable[str] = (),
        apenas_obrigatorias: bool = True,
    ) -> list[dict[str, Any]]:
        """
        O banco de perguntas, filtrado pelos campos logicos pedidos.

        Sem `campos`, devolve as da etapa de pre-proposta - a etapa que o P&D
        Connect cobre (`CONTEXT.md` secao 5 encerra na decisao, nao na proposta
        completa).
        """
        procurados = {campo for campo in campos}
        encontradas = []

        for pergunta in self._dados.get('question_bank', []):
            etapa = str(pergunta.get('stage', ''))

            if not etapa.startswith('Pré-proposta') and not etapa.startswith('Pre-proposta'):
                continue

            if apenas_obrigatorias and str(pergunta.get('required', '')) != 'Sim':
                continue

            if procurados and pergunta.get('field') not in procurados:
                continue

            encontradas.append(pergunta)

        return encontradas

    def gates(self) -> list[dict[str, Any]]:
        """Os impedimentos declarados na baseline (`IA/README.md`, secao Gates)."""
        return list(self._dados.get('gates', []))


@lru_cache(maxsize=1)
def base_conhecimento() -> BaseConhecimentoPIPE:
    """A base lida uma vez por processo - o arquivo nao muda em runtime."""
    return BaseConhecimentoPIPE()
