"""
Escrita da trilha de auditoria.

Unico caminho de gravacao do `historico_evento`. A tabela e append-only: nao
existe aqui update nem delete.
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any
from uuid import UUID

from django.utils import timezone

from apps.audit.models import EventoAuditoria, StatusEvento

if TYPE_CHECKING:
    from datetime import datetime

    from apps.ai.models import ExecucaoIA
    from apps.opportunities.models import Oportunidade

ATOR_SISTEMA = '__sistema__'


def registrar_evento(
    *,
    categoria: str,
    tipo: str,
    entidade: str,
    entidade_id: int | str,
    ator: str = ATOR_SISTEMA,
    status: str = StatusEvento.OK,
    motivo: str = '',
    detalhe: dict[str, Any] | None = None,
    correlation_id: UUID | None = None,
    execucao_ia: ExecucaoIA | None = None,
    ocorrido_em: datetime | None = None,
    oportunidade: Oportunidade | None = None,
) -> EventoAuditoria:
    """
    Grava um evento.

    LGPD: `detalhe` recebe identificadores e diffs de campo de negocio. Nunca
    conteudo de anexo, dado pessoal sensivel, credencial ou chave - quem chama
    e responsavel por nao passar isso.

    `oportunidade` e a FK que o diagrama desenha em HistoricoEvento. Fica
    opcional porque a trilha tambem guarda evento de conta e de login, que nao
    tem oportunidade nenhuma - o diagrama a poe NOT NULL e nao cabe a trilha
    inteira. `entidade`/`entidade_id` seguem sendo a referencia duravel: eles
    sobrevivem ao dia em que a oportunidade for apagada.
    """
    return EventoAuditoria.objects.create(
        ocorrido_em=ocorrido_em or timezone.now(),
        categoria=categoria,
        tipo=tipo,
        ator=str(ator),
        entidade=entidade,
        entidade_id=str(entidade_id),
        status=status,
        motivo=motivo,
        detalhe=detalhe or {},
        correlation_id=correlation_id or uuid.uuid4(),
        execucao_ia=execucao_ia,
        oportunidade=oportunidade,
    )
