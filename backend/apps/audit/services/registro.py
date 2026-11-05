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

from apps.accounts.models import Usuario
from apps.audit.models import EventoAuditoria, StatusEvento

if TYPE_CHECKING:
    from datetime import datetime

    from apps.ai.models import ExecucaoIA
    from apps.opportunities.models import Oportunidade

ATOR_SISTEMA = '__sistema__'


def _texto(ator: str | Usuario) -> str:
    return ator.email if isinstance(ator, Usuario) else str(ator)


def _conta(ator: str | Usuario) -> int | None:
    if isinstance(ator, Usuario):
        return ator.pk

    if ator == ATOR_SISTEMA:
        return None

    return Usuario.objects.filter(email=str(ator)).values_list('pk', flat=True).first()


def registrar_evento(
    *,
    categoria: str,
    tipo: str,
    entidade: str,
    entidade_id: int | str,
    ator: str | Usuario = ATOR_SISTEMA,
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

    `ator` chega como conta ou como e-mail, e o texto gravado e sempre o
    e-mail. O e-mail de uma conta liga o evento a ela; o do sistema e o
    digitado num formulario publico podem nao ser de ninguem, e o evento fica
    so com o texto.
    """
    return EventoAuditoria.objects.create(
        ocorrido_em=ocorrido_em or timezone.now(),
        categoria=categoria,
        tipo=tipo,
        ator=_texto(ator),
        conta_do_ator_id=_conta(ator),
        entidade=entidade,
        entidade_id=str(entidade_id),
        status=status,
        motivo=motivo,
        detalhe=detalhe or {},
        correlation_id=correlation_id or uuid.uuid4(),
        execucao_ia=execucao_ia,
        oportunidade=oportunidade,
    )
