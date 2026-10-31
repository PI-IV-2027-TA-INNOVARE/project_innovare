"""
O teto de gasto com IA como Decorator sobre o provedor (SPEC-04 e SPEC-23).

Tem a mesma interface do provedor que embrulha e confere o limite do mes e o
da oportunidade antes de cada operacao. Estourado, a chamada nao sai e o
resultado e o caminho sem IA, com o motivo para a tela explicar.

O teto fica fora dos adaptadores porque e um so para todos os provedores: o
registro entrega todo provedor ja embrulhado, e um adaptador novo nao precisa
lembrar de conferir. Provedor indisponivel responde por si, com o motivo dele.
"""
from __future__ import annotations

import logging
from typing import Any

from apps.ai.services.custo import (
    MOTIVO_DO_ESTOURO,
    MOTIVO_LIMITE_DO_MES,
    TetoDeCustoExcedido,
    garantir_orcamento,
)
from apps.ai.services.protocolos import ProvedorDeIA
from apps.ai.services.sem_ia import sem_ia

logger = logging.getLogger(__name__)


class ProvedorComTetoDeCusto:
    def __init__(self, provedor: ProvedorDeIA) -> None:
        self.decorado = provedor

    @property
    def disponivel(self) -> bool:
        return bool(getattr(self.decorado, 'disponivel', False))

    def __getattr__(self, nome: str) -> Any:
        if nome == 'decorado':
            raise AttributeError(nome)

        return getattr(self.decorado, nome)

    def _executar(self, operacao: str, **kwargs) -> dict[str, Any]:
        if self.disponivel:
            try:
                garantir_orcamento(oportunidade_id=kwargs.get('oportunidade_id'))
            except TetoDeCustoExcedido as estouro:
                logger.warning(f'{estouro} A chamada de {operacao} nao saiu.')
                return sem_ia(
                    operacao, MOTIVO_DO_ESTOURO.get(estouro.codigo, MOTIVO_LIMITE_DO_MES)
                )

        return getattr(self.decorado, operacao)(**kwargs)

    def sintetizar_entrada(self, **kwargs) -> dict[str, Any]:
        return self._executar('sintetizar_entrada', **kwargs)

    def estruturar_proposta(self, **kwargs) -> dict[str, Any]:
        return self._executar('estruturar_proposta', **kwargs)

    def derivar_competencias(self, **kwargs) -> dict[str, Any]:
        return self._executar('derivar_competencias', **kwargs)

    def executar_matching(self, **kwargs) -> dict[str, Any]:
        return self._executar('executar_matching', **kwargs)

    def pre_analise_pipe(self, **kwargs) -> dict[str, Any]:
        return self._executar('pre_analise_pipe', **kwargs)
