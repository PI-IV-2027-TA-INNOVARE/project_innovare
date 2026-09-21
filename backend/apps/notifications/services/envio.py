"""
Escrita de notificacao in-app.

P17 perguntava se notificacoes ficam no MVP. PB26 respondeu: o Demandante
precisa ser avisado quando o Supervisor pede complementacao. O que segue aberto
e o canal - tela propria, e-mail ou os dois.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from apps.notifications.models import Notificacao

if TYPE_CHECKING:
    from apps.accounts.models import Usuario


def notificar(
    *,
    usuario: Usuario,
    tipo: str,
    titulo: str,
    mensagem: str,
    entidade: str = '',
    entidade_id: int | str = '',
) -> Notificacao:
    """
    LGPD: `mensagem` e texto voltado a pessoa notificada. Nao entram aqui
    credencial, chave, conteudo de anexo nem dado pessoal de terceiro.
    """
    return Notificacao.objects.create(
        usuario=usuario,
        tipo=tipo,
        titulo=titulo,
        mensagem=mensagem,
        entidade=entidade,
        entidade_id=str(entidade_id),
    )
