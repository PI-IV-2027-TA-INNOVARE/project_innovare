"""
Escrita da trilha de auditoria.

Unico caminho de gravacao do `evento_auditoria`. A tabela e append-only: nao
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
) -> EventoAuditoria:
    """
    Grava um evento.

    LGPD: `detalhe` recebe identificadores e diffs de campo de negocio. Nunca
    conteudo de anexo, dado pessoal sensivel, credencial ou chave - quem chama
    e responsavel por nao passar isso.
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
    )
