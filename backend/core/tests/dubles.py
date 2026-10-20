"""
Dubles dos provedores externos.

Existe por causa do mandato 0.1 do `AGENTS.md`: nenhum teste toca o Gemini, a
fila ou qualquer host remoto. O duble devolve o mesmo contrato do gateway real
(`dados`, `execucao_ia`, `fallback_usado`) e grava a `ExecucaoIA` de verdade -
e o que permite testar a rastreabilidade (`ai_run_id`) sem rede.

`ProvedorIndisponivel` imita o gateway sem `GEMINI_API_KEY`: cai no fallback
sem criar execucao, que e exatamente o que `ProvedorGemini` faz quando nasce
indisponivel.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from apps.ai.models import ExecucaoIA, StatusExecucao, TipoExecucaoIA

PROPOSTA_PADRAO = {
    'problema_pesquisa': 'Contaminacao por Alicyclobacillus resiste a pasteurizacao.',
    'hipotese': 'A deteccao por PCR antecipa o descarte do lote.',
    'objetivo_geral': 'Desenvolver protocolo de deteccao rapida.',
    'objetivos_especificos': ['Isolar cepas', 'Validar o metodo'],
    'metodologia': 'Cultivo seletivo seguido de PCR em tempo real.',
    'resultados_esperados': 'Protocolo validado em 48 horas.',
    'caracterizacao_inovacao': 'Reduz de 10 dias para 48 horas.',
    'infraestrutura_recursos': 'Laboratorio de microbiologia da AC2.',
}

COMPETENCIAS_PADRAO = {
    'competencias': [
        {'descricao': 'Microbiologia de alimentos', 'nivel_importancia': 'essencial'},
        {'descricao': 'PCR em tempo real', 'nivel_importancia': 'essencial'},
        {'descricao': 'Estatistica aplicada', 'nivel_importancia': 'desejavel'},
    ]
}

PREANALISE_PADRAO = {
    'dimensoes': [
        {
            'dimensao': 'desafio_tecnologico',
            'avaliacao': 'O desafio esta descrito e e verificavel.',
            'nivel': 'consolidada',
            'evidencias': ['Metodologia cita controles'],
        },
        {
            'dimensao': 'equipe_supervisao',
            'avaliacao': 'A equipe sugerida cobre a bancada.',
            'nivel': 'em_desenvolvimento',
            'evidencias': [],
        },
    ],
    'lacunas': [
        {'dimensao': 'infraestrutura', 'descricao': 'Nao ha descricao do laboratorio.'}
    ],
    'recomendacoes': ['Descrever a infraestrutura disponivel.'],
    'sintese': 'Proposta consistente, com lacuna de infraestrutura.',
}


class ProvedorFake:
    """Provedor de IA que responde o que o teste pedir."""

    def __init__(
        self,
        *,
        proposta: dict[str, Any] | None = None,
        competencias: dict[str, Any] | None = None,
        matches: dict[str, Any] | None = None,
        preanalise: dict[str, Any] | None = None,
    ) -> None:
        self._proposta = PROPOSTA_PADRAO if proposta is None else proposta
        self._competencias = (
            COMPETENCIAS_PADRAO if competencias is None else competencias
        )
        self._matches = {'matches': []} if matches is None else matches
        self._preanalise = PREANALISE_PADRAO if preanalise is None else preanalise
        self.chamadas: list[str] = []

    @property
    def disponivel(self) -> bool:
        return True

    def _responder(
        self, tipo: str, dados: dict[str, Any], executado_por: str
    ) -> dict[str, Any]:
        execucao = ExecucaoIA.objects.create(
            tipo=tipo,
            provedor='fake',
            modelo='duble-de-teste',
            versao_prompt=f'{tipo}_v1',
            status=StatusExecucao.OK,
            latencia_ms=12,
            tokens_entrada=100,
            tokens_saida=200,
            custo_estimado='0.001000',
            executado_por=executado_por,
        )

        return {'dados': dados, 'execucao_ia': execucao, 'fallback_usado': False}

    def estruturar_proposta(self, **kwargs) -> dict[str, Any]:
        self.chamadas.append('estruturar_proposta')
        return self._responder(
            TipoExecucaoIA.COPILOTO, self._proposta, kwargs.get('executado_por', '')
        )

    def derivar_competencias(self, **kwargs) -> dict[str, Any]:
        self.chamadas.append('derivar_competencias')
        return self._responder(
            TipoExecucaoIA.COMPETENCIAS,
            self._competencias,
            kwargs.get('executado_por', ''),
        )

    def executar_matching(self, **kwargs) -> dict[str, Any]:
        self.chamadas.append('executar_matching')
        return self._responder(
            TipoExecucaoIA.MATCHING, self._matches, kwargs.get('executado_por', '')
        )

    def pre_analise_pipe(self, **kwargs) -> dict[str, Any]:
        self.chamadas.append('pre_analise_pipe')
        return self._responder(
            TipoExecucaoIA.PREANALISE,
            self._preanalise,
            kwargs.get('executado_por', ''),
        )


class ProvedorIndisponivel:
    """O gateway sem chave: fallback em toda operacao, sem execucao gravada."""

    @property
    def disponivel(self) -> bool:
        return False

    def _fallback(self, dados: dict[str, Any]) -> dict[str, Any]:
        return {'dados': dados, 'execucao_ia': None, 'fallback_usado': True}

    def estruturar_proposta(self, **kwargs) -> dict[str, Any]:
        return self._fallback(
            {
                'problema_pesquisa': '',
                'hipotese': None,
                'objetivo_geral': '',
                'objetivos_especificos': [],
                'metodologia': '',
                'resultados_esperados': '',
                'caracterizacao_inovacao': '',
                'infraestrutura_recursos': '',
            }
        )

    def derivar_competencias(self, **kwargs) -> dict[str, Any]:
        return self._fallback({'competencias': []})

    def executar_matching(self, **kwargs) -> dict[str, Any]:
        return self._fallback({'matches': []})

    def pre_analise_pipe(self, **kwargs) -> dict[str, Any]:
        return self._fallback(
            {
                'dimensoes': [],
                'lacunas': [],
                'recomendacoes': [],
                'sintese': '',
            }
        )


BASE_PIPE_MINIMA = {
    'metadata': {'baseline_id': 'PIPE_TESTE_V9', 'internal_scale': '0-4'},
    'versioning': [
        {'version': 'V8', 'baseline': 'PIPE_TESTE_V8', 'status': 'ARQUIVADA pela V9'},
        {'version': 'V9', 'baseline': 'PIPE_TESTE_V9', 'status': 'ATIVA'},
    ],
    'criteria_8_5': [
        {
            'id': 'A3',
            'component': 'Projeto',
            'label': 'Metodologia adequada',
            'evaluation_question': 'A metodologia e adequada aos objetivos?',
        },
        {
            'id': 'F1',
            'component': 'Empresa',
            'label': 'Infraestrutura compativel',
            'evaluation_question': 'A infraestrutura suporta a execucao?',
        },
        {
            'id': 'ZZ9',
            'component': 'Desconhecido',
            'label': 'Criterio sem dimensao mapeada',
            'evaluation_question': 'Pergunta de criterio nao mapeado.',
        },
    ],
    'question_bank': [
        {
            'id': 'Q001',
            'topic': 'Problema e inovacao',
            'stage': 'Pré-proposta',
            'question': 'Qual problema real voce quer resolver?',
            'reason': 'Define a dor central.',
            'field': 'problema_mercado',
            'required': 'Sim',
        },
        {
            'id': 'Q010',
            'topic': 'Metodo',
            'stage': 'Pré-proposta',
            'question': 'Como o metodo sera validado?',
            'reason': 'Evita metodo sem validacao.',
            'field': 'metodologia',
            'required': 'Nao',
        },
        {
            'id': 'Q099',
            'topic': 'Orcamento',
            'stage': 'Completa',
            'question': 'Pergunta de etapa posterior.',
            'reason': 'Fora da pre-proposta.',
            'field': 'orcamento',
            'required': 'Sim',
        },
    ],
    'gates': [],
}
"""
Base de Conhecimento de teste.

Tres armadilhas de proposito: um criterio sem dimensao mapeada (`ZZ9`), uma
pergunta de etapa posterior (`Q099`) e uma versao arquivada (`V8`). O teste
cobra que o codigo ignore as duas primeiras e escolha a ATIVA.
"""


def escrever_base_pipe(diretorio: str | Path, dados: dict[str, Any] | None = None) -> Path:
    """Grava a base de teste e devolve o caminho - para `override_settings`."""
    destino = Path(diretorio) / 'base_pipe_de_teste.json'
    destino.write_text(
        json.dumps(BASE_PIPE_MINIMA if dados is None else dados, ensure_ascii=False),
        encoding='utf-8',
    )

    return destino


class ProvedorQueObservaATransacao(ProvedorFake):
    """
    Anota quantos blocos `atomic` estavam abertos no instante da chamada.

    A chamada ao provedor leva segundos. Feita dentro de `transaction.atomic`,
    ela prende a conexao do banco - e os bloqueios das linhas ja escritas -
    durante toda a espera. O teste compara a profundidade da chamada com a de
    antes do caso de uso: igual quer dizer que o caso de uso nao abriu
    transacao em volta dela.

    `durante` roda no meio da chamada e imita o que outra requisicao faria
    enquanto o provedor responde.
    """

    def __init__(self, *, durante=None, **kwargs) -> None:
        super().__init__(**kwargs)
        self._durante = durante
        self.profundidades: list[int] = []

    def _responder(
        self, tipo: str, dados: dict[str, Any], executado_por: str
    ) -> dict[str, Any]:
        from django.db import connection

        self.profundidades.append(len(connection.atomic_blocks))

        if self._durante is not None:
            self._durante()

        return super()._responder(tipo, dados, executado_por)
