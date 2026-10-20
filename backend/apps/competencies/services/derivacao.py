"""
Casos de uso da Competencia Necessaria (RF05 / EP05 / PB42, PB43).

A competencia necessaria e a ponte entre a proposta e a rede: e sobre ela que o
matching opera, nao sobre o texto livre da oportunidade.

Duas decisoes que mudam o resultado:

1. **A derivacao nao cria vocabulario.** Quando a descricao devolvida pela IA
   casa com uma `network.Competencia` que ja existe, a FK e preenchida e o
   matching ganha o vinculo estruturado. Quando nao casa, a competencia fica
   so com a descricao textual. Criar termo novo a cada rodada contaminaria
   justamente a base que o matching precisa ter limpa (plano 6.6).
2. **Derivada e manual convivem.** `derivada_de` distingue as duas, e a
   edicao humana e livre: o PB42 pede competencias "derivadas da proposta,
   editaveis", e nao uma lista que a IA tranca.
"""
from __future__ import annotations

import uuid
from typing import Any

from django.db import transaction

from apps.accounts.models import Usuario
from apps.ai.services.protocolos import ProvedorDeIA
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.competencies.models import (
    CompetenciaNecessaria,
    DerivadaDe,
    NivelImportancia,
)
from apps.copilot.models import PropostaEstruturada
from apps.copilot.services.proposta import proposta_de
from apps.network.models import Competencia
from apps.opportunities.models import Oportunidade
from core.exceptions import ConflitoDeEstado, RecursoNaoEncontrado

ELEMENTOS_NO_TEXTO = (
    ('Problema de pesquisa', 'problema_pesquisa'),
    ('Hipotese', 'hipotese'),
    ('Objetivo geral', 'objetivo_geral'),
    ('Objetivos especificos', 'objetivos_especificos'),
    ('Metodologia', 'metodologia'),
    ('Resultados esperados', 'resultados_esperados'),
    ('Caracterizacao da inovacao', 'caracterizacao_inovacao'),
    ('Infraestrutura e recursos', 'infraestrutura_recursos'),
)


def texto_da_proposta(proposta: PropostaEstruturada) -> str:
    """Os oito elementos num bloco rotulado - a entrada de IA e de score."""
    partes = []

    for rotulo, campo in ELEMENTOS_NO_TEXTO:
        valor = getattr(proposta, campo)

        if isinstance(valor, list):
            valor = '; '.join(str(item) for item in valor)

        if (valor or '').strip():
            partes.append(f'{rotulo}: {valor}')

    return '\n'.join(partes)


def competencias_de(oportunidade: Oportunidade):
    """As competencias necessarias da proposta, ou o 404 explicado."""
    proposta = proposta_de(oportunidade)

    return proposta.competencias_necessarias.select_related('competencia').all()


def _competencia_do_vocabulario(descricao: str) -> Competencia | None:
    return (
        Competencia.objects.filter(nome__iexact=descricao.strip(), ativo=True)
        .order_by('-canonica')
        .first()
    )


class DerivarCompetenciasService:
    """
    Uma rodada de derivacao sobre a proposta (RF05).

    O provedor entra por construtor - duble no teste, Gemini em producao
    (AGENTS.md 0.1).
    """

    def __init__(self, provedor: ProvedorDeIA | None = None) -> None:
        self._provedor = provedor

    def _resolver_provedor(self):
        if self._provedor is not None:
            return self._provedor

        from apps.ai.services.gemini_service import ProvedorGemini

        return ProvedorGemini()

    def execute(
        self, *, oportunidade: Oportunidade, ator: Usuario
    ) -> dict[str, Any]:
        """
        A chamada ao provedor fica fora da transacao, que so abre para gravar.
        As competencias existentes sao relidas ali dentro, com a proposta
        bloqueada: o Supervisor pode ter incluido uma enquanto a IA respondia.
        """
        from apps.competencies.serializers import SaidaCompetenciasSerializer

        proposta = proposta_de(oportunidade)
        texto = texto_da_proposta(proposta)

        if not texto:
            raise ConflitoDeEstado(
                'A proposta estruturada está vazia: não há do que derivar '
                'competências.',
                'proposta_vazia',
            )

        correlation_id = uuid.uuid4()
        resultado = self._resolver_provedor().derivar_competencias(
            oportunidade_id=oportunidade.id_oportunidade,
            proposta_texto=texto,
            correlation_id=correlation_id,
            executado_por=ator.email,
        )

        execucao_ia = resultado.get('execucao_ia')
        fallback_usado = bool(resultado.get('fallback_usado'))
        saida = SaidaCompetenciasSerializer(data=resultado.get('dados') or {})
        aceita = saida.is_valid()
        itens = saida.validated_data.get('competencias', []) if aceita else []

        with transaction.atomic():
            PropostaEstruturada.objects.select_for_update().get(pk=proposta.pk)

            criadas = []
            existentes = {
                registro.descricao.lower()
                for registro in proposta.competencias_necessarias.all()
            }

            for item in itens:
                descricao = item['descricao'].strip()

                if not descricao or descricao.lower() in existentes:
                    continue

                criadas.append(
                    CompetenciaNecessaria.objects.create(
                        proposta=proposta,
                        descricao=descricao[:200],
                        nivel_importancia=item.get(
                            'nivel_importancia', NivelImportancia.ESSENCIAL
                        ),
                        derivada_de=DerivadaDe.COPILOTO,
                        competencia=_competencia_do_vocabulario(descricao),
                        execucao_ia=execucao_ia,
                    )
                )
                existentes.add(descricao.lower())

            registrar_evento(
                categoria=CategoriaEvento.COMPETENCIA,
                tipo='derivacao_executada',
                entidade='proposta_estruturada',
                entidade_id=proposta.id_proposta,
                oportunidade=oportunidade,
                ator=ator.email,
                correlation_id=correlation_id,
                execucao_ia=execucao_ia,
                detalhe={
                    'derivadas': len(criadas),
                    'fallback_usado': fallback_usado,
                    'saida_aceita': aceita,
                },
            )

            return {
                'criadas': criadas,
                'fallback_usado': fallback_usado,
                'execucao_ia': execucao_ia,
            }


class AdicionarCompetenciaService:
    """A competencia que o Supervisor acrescenta a mao (PB43)."""

    @transaction.atomic
    def execute(
        self, *, oportunidade: Oportunidade, dados: dict[str, Any], ator: Usuario
    ) -> CompetenciaNecessaria:
        proposta = proposta_de(oportunidade)
        descricao = dados['descricao'].strip()

        if proposta.competencias_necessarias.filter(
            descricao__iexact=descricao
        ).exists():
            raise ConflitoDeEstado(
                'Esta competência já consta da proposta.', 'competencia_duplicada'
            )

        competencia = CompetenciaNecessaria.objects.create(
            proposta=proposta,
            descricao=descricao,
            nivel_importancia=dados.get(
                'nivel_importancia', NivelImportancia.ESSENCIAL
            ),
            derivada_de=DerivadaDe.MANUAL,
            competencia=_competencia_do_vocabulario(descricao),
        )

        registrar_evento(
            categoria=CategoriaEvento.COMPETENCIA,
            tipo='competencia_adicionada',
            entidade='competencia_necessaria',
            entidade_id=competencia.id_competencia_necessaria,
            oportunidade=oportunidade,
            ator=ator.email,
            detalhe={'descricao': descricao},
        )
        return competencia


class AtualizarCompetenciaService:
    """A revisao humana da competencia derivada (PB42)."""

    @transaction.atomic
    def execute(
        self,
        *,
        competencia: CompetenciaNecessaria,
        dados: dict[str, Any],
        ator: Usuario,
    ) -> CompetenciaNecessaria:
        antes = {campo: getattr(competencia, campo) for campo in dados}

        for campo, valor in dados.items():
            setattr(competencia, campo, valor)

        if 'descricao' in dados:
            competencia.competencia = _competencia_do_vocabulario(
                competencia.descricao
            )

        competencia.save()

        registrar_evento(
            categoria=CategoriaEvento.COMPETENCIA,
            tipo='competencia_revisada',
            entidade='competencia_necessaria',
            entidade_id=competencia.id_competencia_necessaria,
            oportunidade=competencia.proposta.oportunidade,
            ator=ator.email,
            detalhe={
                'campos': sorted(
                    campo
                    for campo in dados
                    if antes[campo] != getattr(competencia, campo)
                )
            },
        )
        return competencia


class RemoverCompetenciaService:
    """
    A competencia que nao se aplica (PB42).

    Remove de verdade: a competencia necessaria e insumo do matching, e um
    registro inativo que continua no banco acabaria pontuando alguem.
    """

    @transaction.atomic
    def execute(
        self, *, competencia: CompetenciaNecessaria, ator: Usuario
    ) -> None:
        oportunidade = competencia.proposta.oportunidade
        identificador = competencia.id_competencia_necessaria
        descricao = competencia.descricao

        competencia.delete()

        registrar_evento(
            categoria=CategoriaEvento.COMPETENCIA,
            tipo='competencia_removida',
            entidade='competencia_necessaria',
            entidade_id=identificador,
            oportunidade=oportunidade,
            ator=ator.email,
            detalhe={'descricao': descricao},
        )


def competencia_necessaria_de(
    oportunidade: Oportunidade, identificador: int
) -> CompetenciaNecessaria:
    """
    A competencia da *proposta desta oportunidade*.

    O filtro pela proposta e o que impede editar, por id, a competencia de
    outra oportunidade.
    """
    proposta = proposta_de(oportunidade)
    competencia = proposta.competencias_necessarias.filter(
        id_competencia_necessaria=identificador
    ).first()

    if competencia is None:
        raise RecursoNaoEncontrado(
            'Competência necessária não encontrada nesta oportunidade.',
            'competencia_inexistente',
        )

    return competencia
