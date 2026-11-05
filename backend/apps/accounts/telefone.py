"""
Telefone de contato do Demandante Externo.

Guardado so com os digitos (DDD e numero). Opcional: vazio e valido.
"""
import re


def somente_digitos(valor: str | None) -> str:
    return re.sub(r'\D', '', valor or '')


def telefone_valido(valor: str | None) -> bool:
    digitos = somente_digitos(valor)

    if not digitos:
        return True

    return len(digitos) in (10, 11) and digitos[0] != '0'


def formatar_telefone(valor: str | None) -> str:
    digitos = somente_digitos(valor)

    if len(digitos) == 11:
        return f'({digitos[:2]}) {digitos[2:7]}-{digitos[7:]}'
    if len(digitos) == 10:
        return f'({digitos[:2]}) {digitos[2:6]}-{digitos[6:]}'

    return digitos
