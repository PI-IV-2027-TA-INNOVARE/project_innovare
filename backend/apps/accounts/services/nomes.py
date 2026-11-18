"""
O nome de quem executou uma etapa, a partir do texto gravado.

Matching e pre-analise guardam o e-mail de quem rodou, ou o marcador do
sistema. Tela e relatorio mostram o nome: e-mail e marcador sao identificadores,
nao texto de leitura.
"""
from __future__ import annotations

from apps.accounts.models import Usuario
from apps.audit.services.registro import ATOR_SISTEMA


def nome_de_quem_executou(registro: str) -> str | None:
    """O nome da conta, "Sistema" para o marcador, ou `None` sem conta."""
    if not registro:
        return None

    if registro == ATOR_SISTEMA:
        return 'Sistema'

    return Usuario.objects.filter(email=registro).values_list('nome', flat=True).first()
