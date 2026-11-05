"""
Medicao da pertinencia do matching numa amostra rotulada pela AC2 (SPEC-16).

A pertinencia e a parte das sugestoes da equipe potencial que a AC2 marcou
como pertinente; a meta do TAP e `AI_MATCH_META_PERTINENCIA` (80%). O total
soma as sugestoes de todos os casos, para um caso com poucas sugestoes nao
pesar o mesmo que um caso com muitas.

A medicao roda o mesmo motor e a mesma composicao da rodada da tela, sem o
rerank do provedor de IA, e nao grava equipe, execucao nem trilha: medir nao
pode mudar o que esta sendo medido. Com `sem_afinidade`, a nota sai so das
outras tres parcelas, que e o calculo de antes da SPEC-13.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from django.conf import settings
from rest_framework import serializers

from apps.competencies.models import CompetenciaNecessaria
from apps.matching.services.matching import candidatos_da_rede, sugestoes_da_rodada
from apps.matching.services.motor import MotorDeMatching, candidato_de
from apps.matching.services.semantica import BaseSemantica, provedor_de_embedding
from apps.network.models import MembroRede
from apps.opportunities.models import Oportunidade
from core.exceptions import ConflitoDeEstado


class CasoDaAmostraSerializer(serializers.Serializer):
    oportunidade = serializers.CharField(max_length=20)
    pertinentes = serializers.ListField(
        child=serializers.IntegerField(min_value=1), allow_empty=True
    )


class AmostraDePertinenciaSerializer(serializers.Serializer):
    descricao = serializers.CharField(required=False, allow_blank=True)
    casos = CasoDaAmostraSerializer(many=True, allow_empty=False)


@dataclass(frozen=True)
class CasoMedido:
    codigo: str
    sugeridos: int
    pertinentes_sugeridos: int

    @property
    def pertinencia(self) -> float:
        return self.pertinentes_sugeridos / self.sugeridos if self.sugeridos else 0.0


@dataclass
class ResultadoDaPertinencia:
    casos: list[CasoMedido] = field(default_factory=list)
    com_afinidade: bool = True
    meta: float = 0.8

    @property
    def sugeridos(self) -> int:
        return sum(caso.sugeridos for caso in self.casos)

    @property
    def pertinentes_sugeridos(self) -> int:
        return sum(caso.pertinentes_sugeridos for caso in self.casos)

    @property
    def pertinencia(self) -> float:
        return self.pertinentes_sugeridos / self.sugeridos if self.sugeridos else 0.0

    @property
    def atingiu_a_meta(self) -> bool:
        return self.pertinencia >= self.meta


class MedirPertinenciaService:
    def __init__(self, motor: MotorDeMatching | None = None) -> None:
        self._motor = motor

    def execute(
        self, *, amostra: dict[str, Any], sem_afinidade: bool = False
    ) -> ResultadoDaPertinencia:
        contrato = AmostraDePertinenciaSerializer(data=amostra)

        if not contrato.is_valid():
            raise ConflitoDeEstado(
                f'A amostra não segue o formato esperado: {contrato.errors}',
                'amostra_invalida',
            )

        casos = contrato.validated_data['casos']
        self._exigir_pessoas_da_rede(casos)

        motor = self._motor or (
            MotorDeMatching()
            if sem_afinidade
            else MotorDeMatching(BaseSemantica(provedor_de_embedding()))
        )
        candidatos = [candidato_de(membro) for membro in candidatos_da_rede()]
        resultado = ResultadoDaPertinencia(
            meta=float(settings.AI_MATCH_META_PERTINENCIA)
        )

        for caso in casos:
            necessarias = self._competencias_de(caso['oportunidade'])
            sugeridas = sugestoes_da_rodada(motor.avaliar(necessarias, candidatos))
            pertinentes = set(caso['pertinentes'])

            resultado.casos.append(
                CasoMedido(
                    codigo=caso['oportunidade'],
                    sugeridos=len(sugeridas),
                    pertinentes_sugeridos=sum(
                        1 for avaliacao in sugeridas if avaliacao.membro.id_membro in pertinentes
                    ),
                )
            )

        resultado.com_afinidade = motor.semantico_disponivel
        return resultado

    def _exigir_pessoas_da_rede(self, casos) -> None:
        pedidos = {identificador for caso in casos for identificador in caso['pertinentes']}
        existentes = set(
            MembroRede.objects.filter(id_membro__in=pedidos).values_list('id_membro', flat=True)
        )
        faltantes = sorted(pedidos - existentes)

        if faltantes:
            raise ConflitoDeEstado(
                'A amostra cita pessoas que não estão na rede: '
                f'{", ".join(str(numero) for numero in faltantes)}.',
                'pessoa_fora_da_rede',
            )

    def _competencias_de(self, codigo: str) -> list[CompetenciaNecessaria]:
        if not Oportunidade.objects.filter(codigo=codigo).exists():
            raise ConflitoDeEstado(
                f'A oportunidade {codigo} da amostra não existe neste banco.',
                'oportunidade_inexistente',
            )

        necessarias = list(
            CompetenciaNecessaria.objects.filter(
                proposta__oportunidade__codigo=codigo
            ).select_related('competencia')
        )

        if not necessarias:
            raise ConflitoDeEstado(
                f'A oportunidade {codigo} não tem competências necessárias derivadas.',
                'sem_competencias',
            )

        return necessarias
