"""
CNPJ: conferencia pelos digitos verificadores e formato de tela.

O banco guarda so os 14 digitos, sem mascara. Nenhuma consulta a servico
externo: o digito verificador ja recusa erro de digitacao.
"""
import re

PESOS_PRIMEIRO_DIGITO = (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)
PESOS_SEGUNDO_DIGITO = (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)


def somente_digitos(valor: str | None) -> str:
    return re.sub(r'\D', '', valor or '')


def _digito(numeros: str, pesos: tuple[int, ...]) -> str:
    resto = sum(int(numero) * peso for numero, peso in zip(numeros, pesos)) % 11
    return '0' if resto < 2 else str(11 - resto)


def cnpj_valido(valor: str | None) -> bool:
    digitos = somente_digitos(valor)

    if len(digitos) != 14 or len(set(digitos)) == 1:
        return False

    primeiro = _digito(digitos[:12], PESOS_PRIMEIRO_DIGITO)
    segundo = _digito(digitos[:12] + primeiro, PESOS_SEGUNDO_DIGITO)

    return digitos[12:] == primeiro + segundo


def formatar_cnpj(valor: str | None) -> str | None:
    digitos = somente_digitos(valor)

    if len(digitos) != 14:
        return valor or None

    return f'{digitos[:2]}.{digitos[2:5]}.{digitos[5:8]}/{digitos[8:12]}-{digitos[12:]}'
