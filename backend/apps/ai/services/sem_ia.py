"""
A resposta de cada operacao de IA quando a IA nao responde: a forma, vazia.

Vale para os tres motivos (sem chave, limite de gasto e falha do provedor) e
para qualquer provedor. Quem consome le sempre a mesma forma, e o motivo vem
ao lado, em `motivo_fallback`, para a tela explicar.
"""
from __future__ import annotations

from typing import Any, Callable

from apps.ai.services.custo import MOTIVO_MODELO_DE_RESERVA

RESPOSTAS_VAZIAS: dict[str, Callable[[], dict[str, Any]]] = {
    'sintetizar_entrada': lambda: {'problema': '', 'contexto': '', 'o_que_falta': []},
    'estruturar_proposta': lambda: {'preenchimentos': {}, 'sugestoes': [], 'avaliacao': []},
    'derivar_competencias': lambda: {'competencias': []},
    'executar_matching': lambda: {'matches': []},
    'pre_analise_pipe': lambda: {
        'dimensoes': [],
        'lacunas': [],
        'recomendacoes': [],
        'sintese': 'Pré-análise indisponível agora: o serviço de IA não respondeu.',
    },
}

OPERACOES = tuple(RESPOSTAS_VAZIAS)


def resposta_vazia(operacao: str) -> dict[str, Any]:
    """Um dicionario novo a cada chamada: quem recebe pode alterar sem afetar o proximo."""
    return RESPOSTAS_VAZIAS[operacao]()


def sem_resposta_da_ia(resultado: dict[str, Any]) -> bool:
    """
    A operacao caiu no caminho sem IA.

    A reserva que respondeu tambem marca `fallback_usado`, para o registro
    dizer que o principal falhou. Mas a resposta e de IA, e quem consome a usa.
    """
    return (
        bool(resultado.get('fallback_usado'))
        and resultado.get('motivo_fallback') != MOTIVO_MODELO_DE_RESERVA
    )


def sem_ia(operacao: str, motivo: str) -> dict[str, Any]:
    """O resultado completo do caminho sem IA, no formato que o provedor devolve."""
    return {
        'dados': resposta_vazia(operacao),
        'execucao_ia': None,
        'fallback_usado': True,
        'motivo_fallback': motivo,
    }
