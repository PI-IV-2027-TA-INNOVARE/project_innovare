"""
A traducao de uma pagina da trilha para o que o Administrador le.

O evento guarda `entidade` e `entidade_id` - referencia duravel, que sobrevive
ao registro apagado. A tela precisa do que ela aponta: o nome da pessoa, a
descricao da competencia, a oportunidade a que pertence. A traducao e feita em
lote, uma consulta por tipo de entidade presente na pagina, e nao uma por
linha.

So identifica o alvo, nunca o reproduz: texto de proposta, de observacao ou
de mensagem nao entra aqui (LGPD - `registrar_evento`).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Callable, Iterable

from apps.audit.models import EventoAuditoria
from apps.audit.services.registro import ATOR_SISTEMA


@dataclass(frozen=True)
class Alvo:
    rotulo: str
    oportunidade: str | None = None
    removido: bool = False


@dataclass(frozen=True)
class Entidade:
    """Como achar e nomear um tipo de entidade da trilha."""

    rotulo: str
    carregar: Callable[[list[str]], dict[str, Any]]
    nomear: Callable[[Any], str]
    codigo_da_oportunidade: Callable[[Any], str | None]


def _inteiros(ids: Iterable[str]) -> list[int]:
    return [int(valor) for valor in ids if str(valor).isdigit()]


def _uuids(ids: Iterable[str]) -> list[uuid.UUID]:
    validos = []

    for valor in ids:
        try:
            validos.append(uuid.UUID(str(valor)))
        except ValueError:
            continue

    return validos


def _por_chave(registros, chave=lambda registro: str(registro.pk)) -> dict[str, Any]:
    return {chave(registro): registro for registro in registros}


def _usuarios(ids):
    from apps.accounts.models import Usuario

    return _por_chave(Usuario.objects.filter(pk__in=_inteiros(ids)))


def _membros_rede(ids):
    from apps.network.models import MembroRede

    return _por_chave(MembroRede.objects.filter(pk__in=_inteiros(ids)))


def _oportunidades(ids):
    from apps.opportunities.models import Oportunidade

    return _por_chave(
        Oportunidade.objects.filter(codigo__in=list(ids)),
        chave=lambda registro: registro.codigo,
    )


def _propostas(ids):
    from apps.copilot.models import PropostaEstruturada

    return _por_chave(
        PropostaEstruturada.objects.filter(pk__in=_inteiros(ids)).select_related(
            'oportunidade'
        )
    )


def _competencias(ids):
    from apps.competencies.models import CompetenciaNecessaria

    return _por_chave(
        CompetenciaNecessaria.objects.filter(pk__in=_inteiros(ids)).select_related(
            'proposta__oportunidade'
        )
    )


def _equipes(ids):
    from apps.matching.models import EquipePotencial

    return _por_chave(
        EquipePotencial.objects.filter(pk__in=_inteiros(ids)).select_related(
            'oportunidade'
        )
    )


def _membros_equipe(ids):
    from apps.matching.models import MembroEquipe

    return _por_chave(
        MembroEquipe.objects.filter(pk__in=_inteiros(ids)).select_related(
            'membro', 'equipe__oportunidade'
        )
    )


def _preanalises(ids):
    from apps.maturity.models import PreAnalise

    return _por_chave(
        PreAnalise.objects.filter(pk__in=_uuids(ids)).select_related(
            'proposta__oportunidade'
        )
    )


def _recomendacoes(ids):
    from apps.maturity.models import Recomendacao

    return _por_chave(
        Recomendacao.objects.filter(pk__in=_inteiros(ids)).select_related(
            'oportunidade'
        )
    )


def _sessoes(ids):
    from apps.copilot.models import SessaoCopiloto

    return _por_chave(
        SessaoCopiloto.objects.filter(pk__in=_uuids(ids)).select_related(
            'oportunidade'
        )
    )


def _mensagens(ids):
    from apps.copilot.models import MensagemCopiloto

    return _por_chave(
        MensagemCopiloto.objects.filter(pk__in=_inteiros(ids)).select_related(
            'sessao__oportunidade'
        )
    )


def _nenhuma(_registro) -> None:
    return None


ENTIDADES: dict[str, Entidade] = {
    'usuario': Entidade(
        'Conta',
        _usuarios,
        lambda usuario: f'{usuario.nome} ({usuario.get_papel_display()})',
        _nenhuma,
    ),
    'membro_rede': Entidade(
        'Pessoa da rede',
        _membros_rede,
        lambda membro: f'{membro.nome} ({membro.get_papel_rede_display()})',
        _nenhuma,
    ),
    'oportunidade': Entidade(
        'Oportunidade',
        _oportunidades,
        lambda oportunidade: oportunidade.titulo,
        lambda oportunidade: oportunidade.codigo,
    ),
    'proposta_estruturada': Entidade(
        'Proposta estruturada',
        _propostas,
        lambda _proposta: 'Proposta estruturada',
        lambda proposta: proposta.oportunidade.codigo,
    ),
    'competencia_necessaria': Entidade(
        'Competência',
        _competencias,
        lambda competencia: f'Competência “{competencia.descricao}”',
        lambda competencia: competencia.proposta.oportunidade.codigo,
    ),
    'equipe_potencial': Entidade(
        'Equipe potencial',
        _equipes,
        lambda _equipe: 'Equipe potencial',
        lambda equipe: equipe.oportunidade.codigo,
    ),
    'membro_equipe': Entidade(
        'Indicação na equipe',
        _membros_equipe,
        lambda indicacao: f'{indicacao.membro.nome}, na equipe potencial',
        lambda indicacao: indicacao.equipe.oportunidade.codigo,
    ),
    'pre_analise_maturidade': Entidade(
        'Pré-análise',
        _preanalises,
        lambda _analise: 'Pré-análise de maturidade',
        lambda analise: analise.proposta.oportunidade.codigo,
    ),
    'recomendacao_adequacao': Entidade(
        'Recomendação',
        _recomendacoes,
        lambda _recomendacao: 'Recomendação da pré-análise',
        lambda recomendacao: recomendacao.oportunidade.codigo,
    ),
    'sessao_copiloto': Entidade(
        'Sessão do Copiloto',
        _sessoes,
        lambda _sessao: 'Sessão do Copiloto',
        lambda sessao: sessao.oportunidade.codigo,
    ),
    'mensagem_copiloto': Entidade(
        'Resposta ao Copiloto',
        _mensagens,
        lambda _mensagem: 'Resposta ao Copiloto',
        lambda mensagem: mensagem.sessao.oportunidade.codigo,
    ),
}

ALVOS_FIXOS = {
    ('ia', 'custo_mensal'): 'Orçamento mensal de IA',
    ('configuracao', 'tema'): 'Aparência da plataforma',
}


def _alvo_sem_registro(evento: EventoAuditoria, codigo: str | None) -> Alvo:
    if evento.entidade == 'criterio_referencia_pipe':
        return Alvo(f'Critérios PIPE, versão {evento.entidade_id}')

    fixo = ALVOS_FIXOS.get((evento.entidade, evento.entidade_id))

    if fixo:
        return Alvo(fixo)

    if evento.entidade == 'ia':
        return Alvo('Gasto de IA da oportunidade', oportunidade=codigo)

    if evento.entidade == 'configuracao':
        return Alvo(f'Configuração “{evento.entidade_id}”')

    return Alvo(f'{evento.entidade} {evento.entidade_id}', oportunidade=codigo)


def _alvo(evento, registros, ator_usuario_id) -> Alvo:
    codigo = evento.oportunidade.codigo if evento.oportunidade_id else None
    entidade = ENTIDADES.get(evento.entidade)

    if entidade is None:
        return _alvo_sem_registro(evento, codigo)

    if evento.entidade == 'usuario' and evento.entidade_id == ator_usuario_id:
        return Alvo('A própria conta')

    registro = registros.get(evento.entidade, {}).get(str(evento.entidade_id))

    if registro is None:
        return Alvo(
            f'{entidade.rotulo} removida do sistema (registro {evento.entidade_id})',
            oportunidade=codigo,
            removido=True,
        )

    return Alvo(
        entidade.nomear(registro),
        oportunidade=codigo or entidade.codigo_da_oportunidade(registro),
    )


def leitura_da_pagina(eventos: list[EventoAuditoria]) -> dict[int, dict[str, Any]]:
    """
    Por evento da pagina: o alvo legivel e o nome de quem agiu.

    Ator que nao e conta - o sistema, ou uma conta que ja nao existe - fica
    com o identificador gravado, que e o que se sabe dele.
    """
    from apps.accounts.models import Usuario

    ids_por_entidade: dict[str, set[str]] = {}

    for evento in eventos:
        if evento.entidade in ENTIDADES:
            ids_por_entidade.setdefault(evento.entidade, set()).add(
                str(evento.entidade_id)
            )

    registros = {
        nome: ENTIDADES[nome].carregar(sorted(ids))
        for nome, ids in ids_por_entidade.items()
    }

    atores = {
        usuario.email: usuario
        for usuario in Usuario.objects.filter(
            email__in={evento.ator for evento in eventos}
        )
    }

    leitura = {}

    for evento in eventos:
        ator = atores.get(evento.ator)
        ator_usuario_id = str(ator.id_usuario) if ator else None

        if evento.ator == ATOR_SISTEMA:
            ator_nome = 'Sistema'
        else:
            ator_nome = ator.nome if ator else evento.ator

        leitura[evento.id_evento] = {
            'alvo': _alvo(evento, registros, ator_usuario_id),
            'ator_nome': ator_nome,
        }

    return leitura
