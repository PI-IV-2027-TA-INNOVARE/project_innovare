"""
Porta de saida de e-mail e seus adaptadores.

`EnviadorDeEmail` e o contrato que o caso de uso conhece; `EnviadorDjango` e o
adaptador sobre `django.core.mail`. O servico depende do contrato, nunca do
transporte - e e isso que deixa o teste trocar o transporte por um duble sem
afrouxar o isolamento (AGENTS.md 0.1).

Em dev e teste o backend de e-mail e console/locmem por settings: nada aqui
abre SMTP real fora de producao.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, runtime_checkable

from django.conf import settings
from django.core.mail import send_mail

if TYPE_CHECKING:
    from apps.accounts.models import TokenAcesso, Usuario


@runtime_checkable
class EnviadorDeEmail(Protocol):
    """Tudo o que um caso de uso precisa saber sobre enviar e-mail."""

    def recuperacao_senha(self, usuario: Usuario, token: TokenAcesso) -> None:
        ...

    def convite_acesso(self, usuario: Usuario, token: TokenAcesso) -> None:
        ...


def _url_frontend(caminho: str, token: str) -> str:
    base = settings.FRONTEND_URL.rstrip('/')
    return f'{base}/{caminho.lstrip("/")}?token={token}'


class EnviadorDjango:
    """Adaptador sobre `django.core.mail`. E o transporte de producao."""

    def recuperacao_senha(self, usuario: Usuario, token: TokenAcesso) -> None:
        link = _url_frontend('redefinir-senha', token.token)
        horas = settings.TOKEN_RECUPERACAO_HORAS

        send_mail(
            subject='P&D Connect - redefinicao de senha',
            message=(
                f'Ola, {usuario.nome}.\n\n'
                f'Recebemos um pedido para redefinir a sua senha no P&D Connect.\n'
                f'Use o link abaixo (valido por {horas} horas):\n\n{link}\n\n'
                'Se nao foi voce, ignore esta mensagem: a senha atual continua valendo.'
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[usuario.email],
            fail_silently=False,
        )

    def convite_acesso(self, usuario: Usuario, token: TokenAcesso) -> None:
        link = _url_frontend('definir-senha', token.token)
        horas = settings.TOKEN_CONVITE_HORAS

        send_mail(
            subject='P&D Connect - seu acesso foi liberado',
            message=(
                f'Ola, {usuario.nome}.\n\n'
                'O Nucleo de P&D liberou o seu acesso ao P&D Connect.\n'
                f'Defina a sua senha pelo link abaixo (valido por {horas} horas):'
                f'\n\n{link}\n'
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[usuario.email],
            fail_silently=False,
        )


class EnviadorEmMemoria:
    """
    Duble para teste: guarda o que seria enviado e nao abre transporte nenhum.

    Serve ao caso em que o teste precisa afirmar *qual* token foi para *qual*
    pessoa - `mail.outbox` responde o que foi enviado, nao com que objeto de
    dominio o caso de uso trabalhou.
    """

    def __init__(self) -> None:
        self.recuperacoes: list[tuple[Usuario, TokenAcesso]] = []
        self.convites: list[tuple[Usuario, TokenAcesso]] = []

    def recuperacao_senha(self, usuario: Usuario, token: TokenAcesso) -> None:
        self.recuperacoes.append((usuario, token))

    def convite_acesso(self, usuario: Usuario, token: TokenAcesso) -> None:
        self.convites.append((usuario, token))
