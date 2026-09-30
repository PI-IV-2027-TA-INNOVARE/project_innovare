"""
Leitura da caixa de notificacoes.

A contraparte do `envio`: aquele escreve, este consulta. `usuario` nao e
opcional em funcao nenhuma deste modulo - a caixa e pessoal, e uma consulta sem
dono seria a porta por onde o aviso de uma organizacao apareceria na tela de
outra. Por isso nao ha `Notificacao.objects.all()` aqui.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from django.db.models import QuerySet

from apps.notifications.models import Notificacao

if TYPE_CHECKING:
    from apps.accounts.models import Usuario


def caixa_de(
    usuario: Usuario, *, apenas_nao_lidas: bool = False
) -> QuerySet[Notificacao]:
    """
    A caixa do proprio usuario, da mais recente para a mais antiga.

    O desempate por `-id_notificacao` importa: uma decisao que avisa varias
    contas da mesma organizacao grava todas no mesmo instante, e sem ele a
    ordem entre elas muda de uma consulta para outra - o bastante para a
    paginacao repetir ou pular linha.
    """
    notificacoes = Notificacao.objects.filter(usuario=usuario)

    if apenas_nao_lidas:
        notificacoes = notificacoes.filter(lida_em__isnull=True)

    return notificacoes.order_by('-criado_em', '-id_notificacao')


def nao_lidas_de(usuario: Usuario) -> int:
    """
    O numero do selo do sino.

    Existe separado da lista porque o selo aparece em toda tela: puxar a caixa
    inteira so para contar seria trafego de pagina a cada navegacao.
    """
    return caixa_de(usuario, apenas_nao_lidas=True).count()
