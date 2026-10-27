"""
Apelidos no lugar de nomes de pessoas, no que sai para o provedor de IA.

Minimizacao da LGPD: a IA avalia competencia, titulacao e disponibilidade, nao
quem a pessoa e. O nome vira "Pesquisador A" na ida e volta a ser o nome na
leitura da resposta, para a tela mostrar a pessoa certa.
"""
from __future__ import annotations

import re
import string
from typing import Any

PREFIXO = 'Pesquisador'
TAMANHO_MINIMO_DE_PARTE = 3

CONTATOS = (
    (re.compile(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+'), '[e-mail]'),
    (re.compile(r'\b(?:https?://|www\.)\S+', re.IGNORECASE), '[endereço]'),
    (re.compile(r'(?:\+\d{2}\s?)?\(?\b\d{2}\)?[\s-]?9?\d{4}-?\d{4}\b'), '[telefone]'),
)
"""
E-mail, endereco e telefone - da pessoa ou de terceiros - que o texto livre da
experiencia pode trazer. O telefone pede DDD: um periodo como `2019-2023` nao
e telefone.
"""


def sem_contato(texto: str) -> str:
    for padrao, marca in CONTATOS:
        texto = padrao.sub(marca, texto)

    return texto


def _letras(indice: int) -> str:
    letras = ''
    numero = indice + 1

    while numero:
        numero, resto = divmod(numero - 1, 26)
        letras = string.ascii_uppercase[resto] + letras

    return letras


class Apelidos:
    """O par nome/apelido de cada pessoa de uma chamada a IA."""

    def __init__(self, nomes: list[str]) -> None:
        self._apelido_de: dict[str, str] = {}

        for nome in nomes:
            if nome and nome not in self._apelido_de:
                self._apelido_de[nome] = f'{PREFIXO} {_letras(len(self._apelido_de))}'

        self._nome_de = {apelido: nome for nome, apelido in self._apelido_de.items()}

    def apelido(self, nome: str) -> str:
        return self._apelido_de.get(nome, nome)

    def anonimizar(self, texto: str) -> str:
        """
        Troca o nome inteiro e cada parte dele pelo apelido da pessoa, e tira
        os contatos do texto.
        """
        resultado = sem_contato(texto or '')

        for nome, apelido in sorted(
            self._apelido_de.items(), key=lambda par: len(par[0]), reverse=True
        ):
            resultado = re.sub(re.escape(nome), apelido, resultado, flags=re.IGNORECASE)

            for parte in nome.split():
                if len(parte) >= TAMANHO_MINIMO_DE_PARTE:
                    resultado = re.sub(
                        rf'\b{re.escape(parte)}\b', apelido, resultado, flags=re.IGNORECASE
                    )

        return resultado

    def restaurar(self, texto: str) -> str:
        """Troca cada apelido da resposta pelo nome da pessoa."""
        if not isinstance(texto, str) or not self._nome_de:
            return texto

        padrao = re.compile(
            r'\b(' + '|'.join(
                re.escape(apelido)
                for apelido in sorted(self._nome_de, key=len, reverse=True)
            ) + r')\b'
        )

        return padrao.sub(lambda achado: self._nome_de[achado.group(1)], texto)

    def restaurar_em(self, dados: Any) -> Any:
        """`restaurar` em todo texto de uma resposta, qualquer que seja a forma."""
        if isinstance(dados, str):
            return self.restaurar(dados)
        if isinstance(dados, list):
            return [self.restaurar_em(item) for item in dados]
        if isinstance(dados, dict):
            return {chave: self.restaurar_em(valor) for chave, valor in dados.items()}
        return dados
