"""
O tipo real do anexo, pelo conteudo do arquivo e pela extensao do nome.

O que o navegador declara nao conta: e texto que o cliente escreve, e um HTML
entrava dizendo que era PDF. Aqui a extensao diz o tipo esperado, e o conteudo
tem de confirmar - pela assinatura no inicio do arquivo, pelo que ha dentro do
pacote do Word e do Excel, ou, no texto, por ser texto de verdade.

Tipo que entrar em `ANEXO_TIPOS_ACEITOS` sem conferencia aqui e recusado: aceitar
sem conferir seria voltar a confiar no nome.
"""
from __future__ import annotations

import os
import zipfile

from django.conf import settings

from core.exceptions import ErroDeDominio

PDF = 'application/pdf'
PNG = 'image/png'
JPEG = 'image/jpeg'
TEXTO = 'text/plain'
CSV = 'text/csv'
DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

TIPO_DA_EXTENSAO = {
    '.pdf': PDF,
    '.png': PNG,
    '.jpg': JPEG,
    '.jpeg': JPEG,
    '.txt': TEXTO,
    '.csv': CSV,
    '.docx': DOCX,
    '.xlsx': XLSX,
}

ASSINATURAS = {
    PDF: b'%PDF-',
    PNG: b'\x89PNG\r\n\x1a\n',
    JPEG: b'\xff\xd8\xff',
}

PARTE_DO_PACOTE = {
    DOCX: 'word/document.xml',
    XLSX: 'xl/workbook.xml',
}

INICIOS_DE_MARCACAO = ('<!doctype', '<html', '<script', '<svg', '<?xml', '<iframe', '<body')

AMOSTRA_BYTES = 8192


def _amostra(arquivo) -> bytes:
    arquivo.seek(0)
    amostra = arquivo.read(AMOSTRA_BYTES)
    arquivo.seek(0)
    return amostra


def _e_texto(amostra: bytes) -> bool:
    if b'\x00' in amostra:
        return False

    try:
        texto = amostra.decode('utf-8')
    except UnicodeDecodeError:
        try:
            texto = amostra.decode('cp1252')
        except UnicodeDecodeError:
            return False

    inicio = texto.lstrip('﻿ \t\r\n').lower()
    return not inicio.startswith(INICIOS_DE_MARCACAO)


def _pacote_tem(arquivo, parte: str) -> bool:
    arquivo.seek(0)

    try:
        with zipfile.ZipFile(arquivo) as pacote:
            return parte in pacote.namelist()
    except zipfile.BadZipFile:
        return False
    finally:
        arquivo.seek(0)


def conteudo_confirma(arquivo, tipo: str) -> bool:
    """O conteudo do arquivo e mesmo do tipo que a extensao promete."""
    if tipo in ASSINATURAS:
        return _amostra(arquivo).startswith(ASSINATURAS[tipo])

    if tipo in PARTE_DO_PACOTE:
        return _amostra(arquivo).startswith(b'PK\x03\x04') and _pacote_tem(
            arquivo, PARTE_DO_PACOTE[tipo]
        )

    if tipo in (TEXTO, CSV):
        return _e_texto(_amostra(arquivo))

    return False


def tipo_conferido(arquivo, nome: str) -> str:
    """
    O tipo que o anexo grava, depois de conferido.

    Extensao fora da lista e `anexo_tipo_recusado`, como antes; conteudo que
    nao confirma a extensao e `anexo_conteudo_recusado`.
    """
    extensao = os.path.splitext(nome or '')[1].lower()
    tipo = TIPO_DA_EXTENSAO.get(extensao)

    if tipo is None or tipo not in settings.ANEXO_TIPOS_ACEITOS:
        raise ErroDeDominio('Tipo de arquivo não aceito.', codigo='anexo_tipo_recusado')

    if not conteudo_confirma(arquivo, tipo):
        raise ErroDeDominio(
            'O conteúdo do arquivo não corresponde à extensão. Envie o documento '
            'original, sem renomear.',
            codigo='anexo_conteudo_recusado',
        )

    return tipo
