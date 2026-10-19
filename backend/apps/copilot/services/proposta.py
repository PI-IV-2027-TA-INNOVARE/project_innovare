"""
Casos de uso da Proposta Estruturada (RF04 / PB40, PB41, PB63).

A proposta nao nasce com a oportunidade: PB40 fala em *consolidar*, e o
Supervisor e quem decide que um problema chegou ao ponto de ser estruturado.
Os oito elementos nascem vazios e sao preenchidos a mao enquanto o Copiloto
nao entra (P22); quando entrar, ele preenche os mesmos campos e `execucao_ia`
deixa de ser nulo.
"""
from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.accounts.models import Usuario
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.copilot.models import PropostaEstruturada
from apps.opportunities.models import Oportunidade
from core.exceptions import ConflitoDeEstado, RecursoNaoEncontrado

CODIGO_INEXISTENTE = 'proposta_inexistente'


def proposta_de(oportunidade: Oportunidade) -> PropostaEstruturada:
    """
    A proposta da oportunidade, ou o 404 explicado.

    O codigo de erro e contrato: a tela ramifica nele para oferecer o inicio
    da proposta em vez de mostrar falha.
    """
    proposta = getattr(oportunidade, 'proposta', None)

    if proposta is None:
        raise RecursoNaoEncontrado(
            'Esta oportunidade ainda nao tem proposta estruturada.',
            CODIGO_INEXISTENTE,
        )

    return proposta


class IniciarPropostaService:
    """O Supervisor abre a proposta vazia (PB40)."""

    @transaction.atomic
    def execute(
        self, *, oportunidade: Oportunidade, ator: Usuario
    ) -> PropostaEstruturada:
        if getattr(oportunidade, 'proposta', None) is not None:
            raise ConflitoDeEstado(
                'Esta oportunidade ja tem proposta estruturada.',
                'proposta_duplicada',
            )

        proposta = PropostaEstruturada.objects.create(oportunidade=oportunidade)

        registrar_evento(
            categoria=CategoriaEvento.COPILOTO,
            tipo='proposta_iniciada',
            entidade='proposta_estruturada',
            entidade_id=proposta.id_proposta,
            oportunidade=oportunidade,
            ator=ator.email,
            detalhe={'versao': proposta.versao},
        )
        return proposta


class AtualizarPropostaService:
    """
    A revisao humana dos oito elementos (PB41, PB63).

    Toda gravacao marca `revisada_por_humano` e guarda o revisor: e a metade
    que o AGENTS.md 0.2 exige de qualquer conteudo que a IA venha a produzir.
    """

    @transaction.atomic
    def execute(
        self,
        *,
        proposta: PropostaEstruturada,
        dados: dict[str, Any],
        ator: Usuario,
    ) -> PropostaEstruturada:
        antes = {campo: getattr(proposta, campo) for campo in dados}

        for campo, valor in dados.items():
            setattr(proposta, campo, valor)

        proposta.revisada_por_humano = True
        proposta.revisor = ator
        proposta.save()

        mudou = [
            campo for campo in dados
            if antes[campo] != getattr(proposta, campo)
        ]

        registrar_evento(
            categoria=CategoriaEvento.COPILOTO,
            tipo='proposta_atualizada',
            entidade='proposta_estruturada',
            entidade_id=proposta.id_proposta,
            oportunidade=proposta.oportunidade,
            ator=ator.email,
            detalhe={'campos': sorted(mudou)},
        )
        return proposta
