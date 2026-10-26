"""
Contrato do provedor de IA.

Existe para o que o `core/tests/test_tipagem.py` cobra: injecao por construtor
so serve se o parametro disser *o que* recebe. Quem implementar um provedor
novo - outro modelo, outro fornecedor, o duble de teste - cumpre esta interface
e nao precisa ler o gateway do Gemini para descobrir o formato.

As quatro operacoes devolvem sempre o mesmo envelope:

    {'dados': dict, 'execucao_ia': ExecucaoIA | None, 'fallback_usado': bool,
     'motivo_fallback': str | None}

`fallback_usado` e parte do contrato, nao detalhe de implementacao: o AGENTS.md
0.2 exige fallback seguro em todo componente de IA, e quem consome precisa saber
que caiu nele para nao apresentar ausencia como resultado. `motivo_fallback`
diz por que - IA indisponivel, falha do provedor ou limite de gasto -, para a
tela explicar em vez de culpar o provedor.
"""
from __future__ import annotations

import uuid
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ProvedorDeIA(Protocol):
    """O que o Copiloto, as competencias, o matching e a pre-analise exigem."""

    @property
    def disponivel(self) -> bool:
        """Falso quando nao ha credencial: toda operacao cai no fallback."""
        ...

    def sintetizar_entrada(
        self,
        oportunidade_id: int,
        entrada: str,
        correlation_id: uuid.UUID,
        executado_por: str,
    ) -> dict[str, Any]:
        ...

    def estruturar_proposta(
        self,
        oportunidade_id: int,
        entrada: str,
        sintese: str,
        preenchidos: dict[str, str],
        vazios: list[str],
        respostas: list[str],
        correlation_id: uuid.UUID,
        executado_por: str,
    ) -> dict[str, Any]:
        ...

    def derivar_competencias(
        self,
        oportunidade_id: int,
        proposta_texto: str,
        correlation_id: uuid.UUID,
        executado_por: str,
    ) -> dict[str, Any]:
        ...

    def executar_matching(
        self,
        oportunidade_id: int,
        competencias_necessarias: list[dict],
        candidatos: list[dict],
        correlation_id: uuid.UUID,
        executado_por: str,
    ) -> dict[str, Any]:
        ...

    def pre_analise_pipe(
        self,
        oportunidade_id: int,
        proposta_texto: str,
        equipe_texto: str,
        criterios: dict[str, Any],
        correlation_id: uuid.UUID,
        executado_por: str,
    ) -> dict[str, Any]:
        ...
