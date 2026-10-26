"""
As situacoes da oportunidade e quem as muda (P13).

Toda mudanca de situacao passa por `mover`: `TRANSICOES` diz para onde cada
situacao pode ir, e o que estiver fora da lista e recusado com o motivo. Quem
dispara e sempre o Supervisor, ao rodar uma etapa ou ao registrar a decisao.

As etapas so andam para a frente. Refazer uma etapa anterior - editar a
proposta depois do matching, derivar de novo - nao muda a situacao. A unica
volta e *Revisar*: a oportunidade retorna para complementacao (PB64) e vai para
Em estruturacao quando o Supervisor retoma a proposta.

Pular etapa vale quando o que a etapa seguinte exige ja existe. A regra de
pronto mora nos portoes de cada servico (proposta revisada, competencias,
equipe potencial); a situacao e o reflexo deles. E o que deixa a reavaliacao
depois de *Revisar* chegar a pre-analise sem refazer o matching.
"""
from __future__ import annotations

from apps.accounts.models import Papel, Usuario
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.opportunities.models import Oportunidade, SituacaoOportunidade
from core.exceptions import AcaoNaoPermitida, ConflitoDeEstado

S = SituacaoOportunidade

ETAPAS_EM_CURSO = (
    S.ENTRADA,
    S.ESTRUTURACAO,
    S.COMPETENCIAS,
    S.MATCHING,
    S.PRE_ANALISE,
    S.AGUARDANDO_DECISAO,
)

TRANSICOES = {
    S.ENTRADA: (S.ESTRUTURACAO, S.COMPETENCIAS, S.MATCHING, S.PRE_ANALISE, S.ARQUIVADA),
    S.ESTRUTURACAO: (S.COMPETENCIAS, S.MATCHING, S.PRE_ANALISE, S.ARQUIVADA),
    S.COMPETENCIAS: (S.MATCHING, S.PRE_ANALISE, S.ARQUIVADA),
    S.MATCHING: (S.PRE_ANALISE, S.ARQUIVADA),
    S.PRE_ANALISE: (S.AGUARDANDO_DECISAO, S.ARQUIVADA),
    S.AGUARDANDO_DECISAO: (S.CONTINUAR, S.REVISAR, S.ARQUIVADA),
    S.REVISAR: (S.ESTRUTURACAO, S.ARQUIVADA),
    S.CONTINUAR: (),
    S.ARQUIVADA: (),
}
"""
As mudancas validas. Pre-analise para Aguardando decisao acontece quando a
pre-analise grava um resultado; as tres decisoes, pelo `RegistrarDecisaoService`.
"""


def _rotulo(situacao: str) -> str:
    return SituacaoOportunidade(situacao).label


def recusa_da_transicao(atual: str, destino: str) -> ConflitoDeEstado | None:
    """O motivo de a mudanca nao valer, ou `None` quando ela esta na lista."""
    if destino in TRANSICOES.get(atual, ()):
        return None

    if atual == S.ARQUIVADA:
        return ConflitoDeEstado(
            'A oportunidade está arquivada e saiu do fluxo ativo.', 'ja_arquivada'
        )

    if atual == S.CONTINUAR:
        return ConflitoDeEstado(
            'A oportunidade já recebeu a decisão Continuar e concluiu o fluxo.',
            'fluxo_concluido',
        )

    if atual == S.REVISAR:
        return ConflitoDeEstado(
            'A oportunidade voltou para revisão. Retome a proposta estruturada '
            'antes de seguir.',
            'transicao_invalida',
        )

    if destino in (S.CONTINUAR, S.REVISAR):
        return ConflitoDeEstado(
            'Continuar e Revisar ficam liberados quando a pré-análise termina e a '
            'oportunidade passa a aguardar decisão.',
            'transicao_invalida',
        )

    return ConflitoDeEstado(
        f'A oportunidade não passa de "{_rotulo(atual)}" para "{_rotulo(destino)}".',
        'transicao_invalida',
    )


def _ja_chegou(atual: str, etapa: str) -> bool:
    """A etapa ja foi alcancada: refaze-la nao volta a situacao."""
    if atual not in ETAPAS_EM_CURSO or etapa not in ETAPAS_EM_CURSO:
        return atual == etapa

    return ETAPAS_EM_CURSO.index(atual) >= ETAPAS_EM_CURSO.index(etapa)


def _situacao_travada(oportunidade: Oportunidade) -> str:
    """
    Rele a situacao com a linha bloqueada: uma decisao pode ter chegado
    enquanto a etapa esperava a IA.
    """
    atual = (
        Oportunidade.objects.select_for_update()
        .filter(pk=oportunidade.pk)
        .values_list('situacao', flat=True)
        .first()
    )
    oportunidade.situacao = atual or oportunidade.situacao
    return oportunidade.situacao


def _mudar(
    oportunidade: Oportunidade,
    anterior: str,
    destino: str,
    ator: Usuario,
    registrar: bool,
) -> None:
    if getattr(ator, 'papel', None) != Papel.SUPERVISOR:
        raise AcaoNaoPermitida(
            'Só o Supervisor muda a situação da oportunidade.', 'papel_nao_conduz'
        )

    recusa = recusa_da_transicao(anterior, destino)

    if recusa is not None:
        raise recusa

    oportunidade.situacao = destino
    oportunidade.save(update_fields=['situacao', 'atualizada_em'])

    if registrar:
        registrar_evento(
            categoria=CategoriaEvento.OPORTUNIDADE,
            tipo='situacao_atualizada',
            entidade='oportunidade',
            entidade_id=oportunidade.codigo,
            oportunidade=oportunidade,
            ator=ator.email,
            detalhe={'de': anterior, 'para': destino},
        )


def mover(
    oportunidade: Oportunidade,
    destino: str,
    ator: Usuario,
    *,
    registrar: bool = True,
) -> None:
    """
    A unica escrita de `situacao`. Chamar dentro de uma transacao.

    A decisao passa `registrar=False`: o evento da decisao ja diz para onde a
    oportunidade foi.
    """
    _mudar(oportunidade, _situacao_travada(oportunidade), destino, ator, registrar)


def exigir_em_curso(oportunidade: Oportunidade) -> None:
    """
    Continuar e Arquivada encerram o fluxo: equipe e competencias ficam como
    estavam na decisao. Incluir alguem na equipe de uma arquivada daria a ele
    leitura dela e dos anexos da empresa.
    """
    if oportunidade.situacao in (S.CONTINUAR, S.ARQUIVADA):
        raise recusa_da_transicao(oportunidade.situacao, S.ESTRUTURACAO)


def conferir_avanco(oportunidade: Oportunidade, etapa: str) -> None:
    """
    A regra de `avancar`, sem gravar.

    Chamado antes da IA: uma etapa que vai ser recusada nao gasta a chamada.
    """
    if _ja_chegou(oportunidade.situacao, etapa):
        return

    recusa = recusa_da_transicao(oportunidade.situacao, etapa)

    if recusa is not None:
        raise recusa


def avancar(oportunidade: Oportunidade, etapa: str, ator: Usuario) -> None:
    """A etapa que o Supervisor rodou passa a ser a situacao, se estiver adiante."""
    atual = _situacao_travada(oportunidade)

    if _ja_chegou(atual, etapa):
        return

    _mudar(oportunidade, atual, etapa, ator, True)


def situacao_pelos_dados(oportunidade: Oportunidade) -> str:
    """
    Ate onde o fluxo da oportunidade ja chegou, lido do que existe nela.

    Serve a conferencia antes do deploy: o que foi feito antes desta regra nao
    mexia na situacao, e uma oportunidade com pre-analise pronta podia estar
    em Entrada.
    """
    proposta = getattr(oportunidade, 'proposta', None)

    if proposta is None:
        return S.ENTRADA

    if proposta.pre_analises.filter(dimensoes__isnull=False).exists():
        return S.AGUARDANDO_DECISAO

    if proposta.pre_analises.exists():
        return S.PRE_ANALISE

    if oportunidade.equipes_potenciais.exists():
        return S.MATCHING

    if proposta.competencias_necessarias.exists():
        return S.COMPETENCIAS

    return S.ESTRUTURACAO


def ajuste_pelos_dados(oportunidade: Oportunidade) -> str | None:
    """
    A situacao que a oportunidade deveria ter, se estiver atrasada.

    So vale para etapa em curso e so para a frente: decisao registrada e
    situacao adiante dos dados ficam como estao.
    """
    atual = oportunidade.situacao

    if atual not in ETAPAS_EM_CURSO:
        return None

    devida = situacao_pelos_dados(oportunidade)

    return None if _ja_chegou(atual, devida) else devida


def ajustar_pelos_dados(oportunidade: Oportunidade) -> str | None:
    """
    Grava o ajuste da conferencia, com o evento em nome do sistema.

    Rele a situacao com a linha travada antes de decidir: uma decisao pode ter
    chegado depois da listagem. Grava por `update` para nao mexer em
    `atualizada_em` - e correcao de registro, nao trabalho novo na fila.
    """
    anterior = _situacao_travada(oportunidade)
    devida = ajuste_pelos_dados(oportunidade)

    if devida is None:
        return None

    Oportunidade.objects.filter(pk=oportunidade.pk).update(situacao=devida)
    oportunidade.situacao = devida

    registrar_evento(
        categoria=CategoriaEvento.OPORTUNIDADE,
        tipo='situacao_atualizada',
        entidade='oportunidade',
        entidade_id=oportunidade.codigo,
        oportunidade=oportunidade,
        detalhe={'de': anterior, 'para': devida, 'conferencia': True},
    )
    return devida
