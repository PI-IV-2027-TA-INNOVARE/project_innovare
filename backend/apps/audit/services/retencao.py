"""
Retencao de dados pessoais (LGPD, SPEC-17).

A trilha guarda eventos de acesso para seguranca. Depois de 12 meses, o que
identifica a pessoa nesses eventos sai: `ator` vira "pessoa removida" e a
ligacao com a conta e desfeita. O fato - tipo, data, entidade e status - fica,
porque e a historia de seguranca da plataforma e nao pertence so a uma pessoa.

Anexos de oportunidade arquivada ficam 24 meses depois da decisao de
arquivamento. Vencido o prazo, a linha e o arquivo fisico sao descartados.

A simulacao e o padrao: ela lista o que venceria e nao escreve nada, nem na
trilha. A aplicacao roda em transacao e deixa um evento `retencao_aplicada`
quando ha algo para descartar.
"""
from __future__ import annotations

import calendar
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from django.conf import settings
from django.db import transaction
from django.db.models import OuterRef, QuerySet, Subquery
from django.utils import timezone

from apps.accounts.services.titular import PESSOA_REMOVIDA
from apps.audit.models import CategoriaEvento, EventoAuditoria
from apps.audit.services.registro import ATOR_SISTEMA, registrar_evento
from apps.decisions.models import Decisao, TipoDecisao
from apps.opportunities.models import AnexoOportunidade

logger = logging.getLogger(__name__)

TIPOS_DE_ACESSO = ('login', 'login_recusado', 'logout')
"""Eventos de conta que existem so para seguranca e rotina de acesso."""


@dataclass(frozen=True)
class EventoVencido:
    id_evento: int
    tipo: str
    ocorrido_em: datetime


@dataclass(frozen=True)
class AnexoVencido:
    id_anexo: int
    nome_original: str
    oportunidade_codigo: str
    arquivada_em: datetime


@dataclass
class ResultadoDaRetencao:
    eventos: list[EventoVencido] = field(default_factory=list)
    anexos: list[AnexoVencido] = field(default_factory=list)
    simulado: bool = True

    @property
    def eventos_anonimizados(self) -> int:
        return 0 if self.simulado else len(self.eventos)

    @property
    def anexos_descartados(self) -> int:
        return 0 if self.simulado else len(self.anexos)


def meses_atras(referencia: datetime, meses: int) -> datetime:
    """A mesma hora, `meses` meses antes, sem cair num dia que nao existe."""
    if meses < 0:
        raise ValueError('A retencao nao aceita prazo negativo.')

    total = referencia.month - 1 - meses
    ano = referencia.year + total // 12
    mes = total % 12 + 1
    dia = min(referencia.day, calendar.monthrange(ano, mes)[1])

    return referencia.replace(year=ano, month=mes, day=dia)


def _eventos_vencidos(corte: datetime) -> QuerySet[EventoAuditoria]:
    return (
        EventoAuditoria.objects.filter(
            categoria=CategoriaEvento.CONTA,
            tipo__in=TIPOS_DE_ACESSO,
            ocorrido_em__lt=corte,
        )
        .exclude(ator__in=(PESSOA_REMOVIDA, ATOR_SISTEMA))
        .order_by('ocorrido_em', 'pk')
    )


def _anexos_vencidos(corte: datetime) -> QuerySet[AnexoOportunidade]:
    ultima_decisao = (
        Decisao.objects.filter(
            oportunidade=OuterRef('oportunidade_id'),
            tipo_decisao=TipoDecisao.ARQUIVAR,
        )
        .order_by('-registrada_em')
        .values('registrada_em')[:1]
    )

    return (
        AnexoOportunidade.objects.annotate(
            arquivada_em=Subquery(ultima_decisao)
        )
        .filter(arquivada_em__lt=corte)
        .select_related('oportunidade')
        .order_by('arquivada_em', 'pk')
    )


def _apagar_arquivos(arquivos: list[Any]) -> None:
    for arquivo in arquivos:
        if not arquivo:
            continue

        try:
            arquivo.delete(save=False)
        except OSError as erro:
            logger.warning(
                'Nao foi possivel apagar o arquivo vencido %s: %s',
                arquivo.name,
                erro,
            )


class AplicarRetencaoService:
    """Simula ou aplica os prazos de retencao configurados."""

    def execute(
        self, *, agora: datetime | None = None, aplicar: bool = False
    ) -> ResultadoDaRetencao:
        agora = agora or timezone.now()
        meses_eventos = settings.RETENCAO_EVENTOS_CONTA_MESES
        meses_anexos = settings.RETENCAO_ANEXOS_MESES

        eventos = list(_eventos_vencidos(meses_atras(agora, meses_eventos)))
        anexos = list(_anexos_vencidos(meses_atras(agora, meses_anexos)))

        resultado = ResultadoDaRetencao(
            eventos=[
                EventoVencido(
                    id_evento=evento.pk,
                    tipo=evento.tipo,
                    ocorrido_em=evento.ocorrido_em,
                )
                for evento in eventos
            ],
            anexos=[
                AnexoVencido(
                    id_anexo=anexo.pk,
                    nome_original=anexo.nome_original,
                    oportunidade_codigo=anexo.oportunidade.codigo,
                    arquivada_em=anexo.arquivada_em,
                )
                for anexo in anexos
            ],
            simulado=not aplicar,
        )

        if not aplicar or not (eventos or anexos):
            return resultado

        with transaction.atomic():
            ids_eventos = [evento.pk for evento in eventos]

            if ids_eventos:
                EventoAuditoria.objects.filter(pk__in=ids_eventos).update(
                    ator=PESSOA_REMOVIDA, conta_do_ator=None
                )

            arquivos = [anexo.arquivo for anexo in anexos]
            ids_anexos = [anexo.pk for anexo in anexos]

            if ids_anexos:
                AnexoOportunidade.objects.filter(pk__in=ids_anexos).delete()

            registrar_evento(
                categoria=CategoriaEvento.CONFIG,
                tipo='retencao_aplicada',
                entidade='retencao',
                entidade_id='lgpd',
                ator=ATOR_SISTEMA,
                detalhe={
                    'eventos_anonimizados': len(eventos),
                    'anexos_descartados': len(anexos),
                    'retencao_eventos_meses': meses_eventos,
                    'retencao_anexos_meses': meses_anexos,
                },
            )

            if arquivos:
                transaction.on_commit(lambda: _apagar_arquivos(arquivos))

        return resultado
