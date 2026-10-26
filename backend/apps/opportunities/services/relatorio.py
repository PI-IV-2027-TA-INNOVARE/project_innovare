"""
Visao consolidada da Oportunidade (RF14 / PB76).

O relatorio nao cria dado nenhum: ele junta numa leitura so o que a tela de
conducao busca em quatro chamadas separadas - identificacao, entrada, anexos,
decisao e trilha - mais a Proposta Estruturada.

As secoes que dependem das fases seguintes nao somem do documento: elas saem
declaradas em `pendentes`, com o motivo em linguagem de produto. Relatorio que
omite a secao faz o leitor concluir que ela nao existe; relatorio que a declara
vazia diz a verdade - ela existe e ainda nao foi preenchida.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from django.db.models import QuerySet
from django.utils import timezone

from django.db.models import Q

from apps.audit.models import EventoAuditoria
from apps.competencies.models import CompetenciaNecessaria
from apps.copilot.models import PropostaEstruturada
from apps.decisions.models import Decisao
from apps.matching.models import EquipePotencial
from apps.maturity.models import CriterioPreAnalise, PreAnalise
from apps.opportunities.models import AnexoOportunidade, Oportunidade

MOTIVO_PROPOSTA_NAO_INICIADA = (
    'A proposta estruturada ainda não foi iniciada para esta oportunidade.'
)

MOTIVO_SEM_COMPETENCIAS = (
    'As competências necessárias ainda não foram derivadas da proposta '
    'estruturada.'
)

MOTIVO_SEM_EQUIPE = (
    'A equipe potencial ainda não foi gerada: ela parte das competências '
    'necessárias.'
)

MOTIVO_SEM_PRE_ANALISE = (
    'A pré-análise de maturidade ainda não foi feita para esta proposta.'
)


@dataclass(frozen=True)
class SecaoPendente:
    """Uma secao que o documento reconhece e ainda nao tem conteudo."""

    secao: str
    motivo: str


@dataclass(frozen=True)
class RelatorioDaOportunidade:
    """
    O documento consolidado, como ele vai para a tela ou para a impressao.

    `gerado_em` nao e enfeite: impresso ou apresentado, o relatorio deixa de
    acompanhar a oportunidade, e sem o carimbo nao da para saber o que mudou
    desde que ele saiu.
    """

    oportunidade: Oportunidade
    anexos: tuple[AnexoOportunidade, ...]
    historico: tuple[EventoAuditoria, ...]
    decisao: Decisao | None
    proposta: PropostaEstruturada | None
    competencias: tuple[CompetenciaNecessaria, ...]
    equipe: EquipePotencial | None
    pre_analise: PreAnalise | None
    pendentes: tuple[SecaoPendente, ...]
    gerado_em: datetime


class FluxoDaOportunidade:
    """
    Facade de leitura sobre a oportunidade inteira.

    Existe para que a view nao precise conhecer cinco modelos de quatro apps
    para montar um documento, e para que a pergunta "o que ja se sabe desta
    oportunidade" tenha uma resposta so, no lugar certo.

    Recebe a oportunidade ja resolvida pelo escopo do ator: quem nao alcanca o
    registro na fila nao chega ate aqui, e o facade nao reabre esse portao.
    """

    def __init__(self, oportunidade: Oportunidade) -> None:
        self._oportunidade = oportunidade

    def relatorio(self) -> RelatorioDaOportunidade:
        proposta = self._proposta()
        competencias = tuple(self._competencias(proposta))
        equipe = self._equipe()
        pre_analise = self._pre_analise(proposta)

        return RelatorioDaOportunidade(
            oportunidade=self._oportunidade,
            anexos=tuple(self._anexos()),
            historico=tuple(self._historico()),
            decisao=self._ultima_decisao(),
            proposta=proposta,
            competencias=competencias,
            equipe=equipe,
            pre_analise=pre_analise,
            pendentes=self._pendentes(
                proposta=proposta,
                competencias=competencias,
                equipe=equipe,
                pre_analise=pre_analise,
            ),
            gerado_em=timezone.now(),
        )

    def _anexos(self) -> QuerySet[AnexoOportunidade]:
        return self._oportunidade.anexos.select_related('enviado_por').order_by(
            'criado_em'
        )

    def _historico(self) -> QuerySet[EventoAuditoria]:
        """
        A trilha da oportunidade inteira.

        O filtro inclui a FK: evento de Copiloto, matching e pre-analise aponta
        para a proposta ou para a equipe em `entidade`, e so a FK os prende a
        esta oportunidade.
        """
        return EventoAuditoria.objects.filter(
            Q(oportunidade=self._oportunidade)
            | Q(entidade='oportunidade', entidade_id=self._oportunidade.codigo)
        ).order_by('-ocorrido_em')

    def _competencias(
        self, proposta: PropostaEstruturada | None
    ) -> QuerySet[CompetenciaNecessaria] | tuple:
        if proposta is None:
            return ()

        return proposta.competencias_necessarias.select_related('competencia').all()

    def _equipe(self) -> EquipePotencial | None:
        return (
            self._oportunidade.equipes_potenciais.select_related('execucao')
            .prefetch_related(
                'membros__membro__titulacao', 'membros__membro__usuario', 'lacunas'
            )
            .first()
        )

    def _pre_analise(
        self, proposta: PropostaEstruturada | None
    ) -> PreAnalise | None:
        if proposta is None:
            return None

        return proposta.pre_analises.prefetch_related(
            'dimensoes', 'lacunas', 'recomendacoes'
        ).first()

    def _ultima_decisao(self) -> Decisao | None:
        return self._oportunidade.decisoes.select_related('responsavel').first()

    def _proposta(self) -> PropostaEstruturada | None:
        return getattr(self._oportunidade, 'proposta', None)

    def _pendentes(
        self,
        *,
        proposta: PropostaEstruturada | None,
        competencias: tuple[CompetenciaNecessaria, ...],
        equipe: EquipePotencial | None,
        pre_analise: PreAnalise | None,
    ) -> tuple[SecaoPendente, ...]:
        """
        O que o documento reconhece e ainda nao tem conteudo.

        A lista deixou de ser fixa: as tres etapas existem, e o motivo agora
        diz *o que falta fazer* - derivar, rodar o matching, pre-analisar - em
        vez de informar que a etapa nao esta disponivel no produto.
        """
        pendentes = []

        if proposta is None:
            pendentes.append(
                SecaoPendente(
                    secao='proposta_estruturada',
                    motivo=MOTIVO_PROPOSTA_NAO_INICIADA,
                )
            )

        if not competencias:
            pendentes.append(
                SecaoPendente(
                    secao='competencias_necessarias',
                    motivo=MOTIVO_SEM_COMPETENCIAS,
                )
            )

        if equipe is None:
            pendentes.append(
                SecaoPendente(secao='equipe_potencial', motivo=MOTIVO_SEM_EQUIPE)
            )

        if pre_analise is None:
            pendentes.append(
                SecaoPendente(secao='pre_analise', motivo=MOTIVO_SEM_PRE_ANALISE)
            )

        return tuple(pendentes)


PARCELAS_DA_NOTA = (
    ('semantico', 'afinidade com o tema'),
    ('lexical', 'palavras em comum'),
    ('area', 'área de atuação'),
    ('disponibilidade', 'disponibilidade'),
)


def _porcento(valor) -> str:
    try:
        return f'{round(float(valor) * 100)}%'
    except (TypeError, ValueError):
        return '-'


def como_foi_calculado(equipe: EquipePotencial) -> tuple[str, ...]:
    """
    A explicacao da nota, montada com os pesos da propria rodada.

    E o texto que sai da aba Equipe para o relatorio: na tela fica o essencial,
    aqui fica como cada numero foi produzido.
    """
    execucao = equipe.execucao
    pesos = (execucao.pesos or {}).get('componentes', {}) if execucao else {}

    parcelas = ', '.join(
        f'{nome} ({_porcento(pesos[chave])})'
        for chave, nome in PARCELAS_DA_NOTA
        if chave in pesos
    )

    paragrafos = [
        'A nota de cada pessoa soma quatro parcelas, cada uma com o seu peso: '
        f'{parcelas}.' if parcelas else
        'A nota de cada pessoa soma a afinidade com o tema, as palavras em '
        'comum, a área de atuação e a disponibilidade.',
        'A afinidade com o tema compara o sentido das competências necessárias '
        'com o perfil da pessoa, mesmo com palavras diferentes. Palavras em '
        'comum contam os termos iguais. Área de atuação compara as linhas de '
        'pesquisa, e disponibilidade pesa o tempo que a pessoa declarou.',
    ]

    if execucao is not None and execucao.fallback_usado:
        paragrafos.append(
            'Nesta rodada a afinidade com o tema não estava disponível: a nota '
            'saiu das outras três parcelas, reescaladas para somar 100%.'
        )

    desejavel = (execucao.pesos or {}).get('desejavel') if execucao else None

    if desejavel is not None:
        paragrafos.append(
            'Na cobertura das competências, uma competência desejável vale '
            f'{_porcento(desejavel)} de uma essencial.'
        )

    if execucao is not None and execucao.usou_rerank:
        paragrafos.append(
            'Depois do cálculo, a IA revisou a ordem das pessoas e acrescentou '
            'motivos. A nota de cada pessoa não muda com essa revisão.'
        )

    paragrafos.append(
        'A composição é uma sugestão: o Supervisor valida e ajusta a equipe. '
        'Ninguém é convidado nem convocado pelo sistema.'
    )

    return tuple(paragrafos)


def como_ler_a_preanalise(analise: PreAnalise) -> tuple[str, ...]:
    """O texto que explica a leitura do relatorio da pre-analise."""
    versao = analise.versao_criterio.versao if analise.versao_criterio_id else '-'

    return (
        'A pré-análise compara a proposta com os critérios da chamada '
        f'PIPE/FAPESP na versão {versao}, agrupados em seis dimensões.',
        'Cada dimensão recebe um de três níveis. Consolidada: o que a dimensão '
        'pede está demonstrado na proposta. Em desenvolvimento: está em parte '
        'demonstrado, com lacunas a fechar. Frágil: está ausente ou pouco '
        'demonstrado.',
        'As lacunas dizem o que falta. As recomendações dizem o que fazer para '
        'fechar cada lacuna. Uma recomendação marcada como acatada já foi '
        'aplicada pela equipe, e a próxima pré-análise mostra se a dimensão '
        'avançou.',
        'É orientação interna do P&D Connect: não é nota, parecer nem decisão '
        'da FAPESP.',
    )


@dataclass(frozen=True)
class RelatorioDaPreAnalise:
    """
    O documento do PB78: resultados por dimensao, lacunas e recomendacoes.

    Carrega os **criterios da versao que a analise citou**, nao os vigentes de
    hoje. E a razao de `CriterioPreAnalise` ser versionado: um relatorio de
    outubro reimpresso em dezembro tem de continuar dizendo contra o que foi
    analisado, mesmo que a baseline tenha mudado no meio.
    """

    oportunidade: Oportunidade
    proposta: PropostaEstruturada
    pre_analise: PreAnalise
    criterios: tuple[CriterioPreAnalise, ...]
    equipe: EquipePotencial | None
    gerado_em: datetime
    como_ler: tuple[str, ...] = ()


class PreAnaliseDaOportunidade:
    """
    Facade de leitura do Relatorio da Pre-analise (PB78).

    A aba Pre-analise mostra a ultima execucao para trabalhar; este documento
    mostra a mesma execucao para **sair da tela** - impressa ou apresentada -, e
    por isso junta a proposta avaliada, a equipe que entrou na avaliacao e os
    criterios da versao citada.
    """

    def __init__(self, oportunidade: Oportunidade) -> None:
        self._oportunidade = oportunidade

    def relatorio(self) -> RelatorioDaPreAnalise:
        from apps.maturity.services.preanalise import preanalise_atual_de

        analise = preanalise_atual_de(self._oportunidade)

        return RelatorioDaPreAnalise(
            oportunidade=self._oportunidade,
            proposta=analise.proposta,
            pre_analise=analise,
            criterios=tuple(
                CriterioPreAnalise.objects.filter(
                    versao_criterio_id=analise.versao_criterio_id
                )
                .select_related('versao_criterio')
                .order_by('dimensao', 'codigo')
            ),
            equipe=self._equipe(),
            gerado_em=timezone.now(),
            como_ler=como_ler_a_preanalise(analise),
        )

    def _equipe(self) -> EquipePotencial | None:
        return (
            self._oportunidade.equipes_potenciais.prefetch_related(
                'membros__membro__titulacao', 'membros__membro__usuario'
            ).first()
        )


@dataclass(frozen=True)
class RelatorioDaEquipe:
    """
    O documento do PB77: composicao sugerida e as aderencias do matching.

    Leva a `ExecucaoMatching` junto porque "aderencia" sem os pesos da rodada e
    um numero sem regua: o mesmo 0,62 significa coisas diferentes se o PO mexeu
    nos pesos entre uma rodada e outra.
    """

    oportunidade: Oportunidade
    equipe: EquipePotencial
    competencias: tuple[CompetenciaNecessaria, ...]
    gerado_em: datetime
    como_foi_calculado: tuple[str, ...] = ()


class EquipeDaOportunidade:
    """
    Facade de leitura do Relatorio de Equipe Potencial (PB77).

    A aba mostra a composicao para ajustar; este documento a mostra para sair
    da tela - e por isso junta as competencias necessarias que a rodada
    comparou, sem as quais a aderencia nao se interpreta.
    """

    def __init__(self, oportunidade: Oportunidade) -> None:
        self._oportunidade = oportunidade

    def relatorio(self) -> RelatorioDaEquipe:
        from apps.matching.services.matching import equipe_atual_de

        equipe = equipe_atual_de(self._oportunidade)
        proposta = getattr(self._oportunidade, 'proposta', None)

        return RelatorioDaEquipe(
            oportunidade=self._oportunidade,
            equipe=equipe,
            competencias=(
                tuple(
                    proposta.competencias_necessarias.select_related('competencia')
                )
                if proposta is not None
                else ()
            ),
            gerado_em=timezone.now(),
            como_foi_calculado=como_foi_calculado(equipe),
        )
