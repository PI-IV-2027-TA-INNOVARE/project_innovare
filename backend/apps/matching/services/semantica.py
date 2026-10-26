"""
A base semantica do matching: a parcela "Afinidade com o tema".

Junta o provedor de embedding aos vetores gravados. Antes de cada rodada,
`preparar` confere o vetor de cada perfil e de cada competencia necessaria:
o que ja esta gravado com o mesmo texto e o mesmo modelo e reaproveitado; o
resto e calculado num lote so e gravado. Se o modelo cair, a rodada inteira
segue sem a parcela - o fallback que o AGENTS.md 0.2 nomeia.
"""
from __future__ import annotations

import hashlib
import logging
import time
from typing import Any, Sequence

from django.conf import settings
from django.utils import timezone

from apps.ai.models import ExecucaoIA, StatusExecucao, TipoExecucaoIA
from apps.competencies.models import CompetenciaNecessaria
from apps.matching.models import VetorCompetenciaNecessaria, VetorMembro
from apps.matching.services.motor import Candidato, EmbeddingIndisponivel
from apps.network.services.vocabulario import Vocabulario

logger = logging.getLogger(__name__)


def provedor_de_embedding():
    """O MiniLM local, ou a ausencia declarada quando a base esta desligada."""
    if not settings.SEARCH_EMBEDDING_ENABLED:
        return EmbeddingIndisponivel()

    from apps.ai.services.embedding import provedor_minilm

    return provedor_minilm()


def texto_do_perfil(candidato: Candidato, vocabulario: Vocabulario | None = None) -> str:
    """
    O perfil como texto corrido, na forma que vira vetor.

    Inclui a formacao (curso e nivel), alem de competencias, tecnicas, linhas
    de pesquisa e experiencia: a formacao tambem diz em que tema a pessoa atua.
    """
    vocabulario = vocabulario or Vocabulario.da_rede()
    membro = candidato.membro

    formacoes = [
        f'{formacao.curso} ({formacao.titulacao.rotulo})'
        if formacao.titulacao_id
        else formacao.curso
        for formacao in membro.formacoes.all()
    ]

    partes = [
        ('Competências', ', '.join(candidato.competencias)),
        ('Técnicas', ', '.join(candidato.tecnicas)),
        ('Linhas de pesquisa', ', '.join(candidato.linhas)),
        ('Formação', ', '.join(formacoes)),
        ('Experiência', membro.experiencia or ''),
    ]

    return vocabulario.canonizar(
        ' '.join(f'{rotulo}: {valor}.' for rotulo, valor in partes if valor.strip())
    )


def texto_da_competencia(
    competencia: CompetenciaNecessaria, vocabulario: Vocabulario | None = None
) -> str:
    return (vocabulario or Vocabulario.da_rede()).canonizar(competencia.descricao)


def _resumo(texto: str, modelo: str) -> str:
    return hashlib.sha256(f'{modelo}\n{texto}'.encode('utf-8')).hexdigest()


class BaseSemantica:
    """O que o motor consulta para a parcela de afinidade."""

    def __init__(self, provedor: Any) -> None:
        self._provedor = provedor
        self._disponivel = bool(getattr(provedor, 'disponivel', False))
        self._membros: dict[int, list[float]] = {}
        self._competencias: dict[int, list[float]] = {}

    @property
    def disponivel(self) -> bool:
        return self._disponivel

    @property
    def modelo(self) -> str:
        return getattr(self._provedor, 'modelo', '') if self._disponivel else ''

    def vetor_do_candidato(self, candidato: Candidato) -> list[float] | None:
        return self._membros.get(candidato.membro.pk)

    def vetor_da_competencia(self, competencia: CompetenciaNecessaria) -> list[float] | None:
        return self._competencias.get(competencia.pk)

    def preparar(
        self,
        competencias: Sequence[CompetenciaNecessaria],
        candidatos: Sequence[Candidato],
    ) -> dict[str, int]:
        """Garante os vetores da rodada. Devolve quantos foram calculados agora."""
        if not self._disponivel:
            return {'calculados': 0, 'reaproveitados': 0}

        vocabulario = Vocabulario.da_rede()
        modelo = self.modelo

        gravados_membro = {
            vetor.membro_id: vetor
            for vetor in VetorMembro.objects.filter(
                membro_id__in=[candidato.membro.pk for candidato in candidatos]
            )
        }
        gravados_competencia = {
            vetor.competencia_necessaria_id: vetor
            for vetor in VetorCompetenciaNecessaria.objects.filter(
                competencia_necessaria_id__in=[competencia.pk for competencia in competencias]
            )
        }

        pendentes: list[tuple[str, int, str, str]] = []

        for candidato in candidatos:
            texto = texto_do_perfil(candidato, vocabulario)
            resumo = _resumo(texto, modelo)
            gravado = gravados_membro.get(candidato.membro.pk)

            if gravado is not None and gravado.texto_hash == resumo:
                self._membros[candidato.membro.pk] = gravado.vetor
            else:
                pendentes.append(('membro', candidato.membro.pk, texto, resumo))

        for competencia in competencias:
            texto = texto_da_competencia(competencia, vocabulario)
            resumo = _resumo(texto, modelo)
            gravado = gravados_competencia.get(competencia.pk)

            if gravado is not None and gravado.texto_hash == resumo:
                self._competencias[competencia.pk] = gravado.vetor
            else:
                pendentes.append(('competencia', competencia.pk, texto, resumo))

        reaproveitados = len(self._membros) + len(self._competencias)

        if pendentes:
            self._calcular(pendentes, modelo)

        return {
            'calculados': len(pendentes) if self._disponivel else 0,
            'reaproveitados': reaproveitados,
        }

    def _calcular(self, pendentes: list[tuple[str, int, str, str]], modelo: str) -> None:
        inicio = time.perf_counter()

        try:
            vetores = self._provedor.vetores([texto for _, _, texto, _ in pendentes])
        except Exception:
            logger.warning('Afinidade com o tema indisponivel nesta rodada.')
            self._disponivel = False
            self._membros.clear()
            self._competencias.clear()
            return

        agora = timezone.now()

        for (tipo, chave, _, resumo), vetor in zip(pendentes, vetores):
            dados = {
                'vetor': vetor,
                'modelo': modelo,
                'texto_hash': resumo,
                'gerado_em': agora,
            }

            if tipo == 'membro':
                VetorMembro.objects.update_or_create(membro_id=chave, defaults=dados)
                self._membros[chave] = vetor
            else:
                VetorCompetenciaNecessaria.objects.update_or_create(
                    competencia_necessaria_id=chave, defaults=dados
                )
                self._competencias[chave] = vetor

        ExecucaoIA.objects.create(
            tipo=TipoExecucaoIA.EMBEDDING,
            provedor=getattr(self._provedor, 'provedor', 'local'),
            modelo=modelo[:80],
            status=StatusExecucao.OK,
            latencia_ms=int((time.perf_counter() - inicio) * 1000),
            concluido_em=agora,
        )
