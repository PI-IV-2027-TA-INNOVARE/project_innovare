"""
Registro de que a pessoa leu a notificacao.

Separado do `envio` e da `consulta` porque e a unica escrita que parte de quem
recebe, e nao do fluxo: o service da Oportunidade cria, a pessoa da baixa.

Nao ha exclusao. A notificacao lida some do selo e continua na caixa - apagar
seria destruir o unico registro de que o aviso chegou.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from django.utils import timezone

from apps.notifications.models import Notificacao
from apps.notifications.services.consulta import caixa_de
from core.exceptions import RecursoNaoEncontrado

if TYPE_CHECKING:
    from apps.accounts.models import Usuario


def marcar_como_lida(*, usuario: Usuario, id_notificacao: int) -> Notificacao:
    """
    Idempotente: reabrir uma notificacao ja lida nao reescreve o carimbo.

    A busca parte da `caixa_de`, entao a notificacao de outra pessoa nao e
    negada - ela nao e encontrada. A diferenca e deliberada: um 403 confirmaria
    que aquele identificador aponta para algo real.
    """
    notificacao = caixa_de(usuario).filter(pk=id_notificacao).first()

    if notificacao is None:
        raise RecursoNaoEncontrado(
            'Notificacao nao encontrada.', codigo='notificacao_nao_encontrada'
        )

    if notificacao.lida_em is None:
        notificacao.lida_em = timezone.now()
        notificacao.save(update_fields=['lida_em'])

    return notificacao


def marcar_todas_como_lidas(usuario: Usuario) -> int:
    """Limpa o selo de uma vez. Devolve quantas foram marcadas."""
    return caixa_de(usuario, apenas_nao_lidas=True).update(lida_em=timezone.now())
