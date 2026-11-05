"""
Backup do banco so cifrado, e descarte com registro (LGPD).

Copia do banco com dado real nao fica em disco em texto aberto. O caminho e:

    python scripts/backup_cifrado.py copiar backups/neon/neondb_AAAA-MM-DD.dump -- pg_dump -Fc -h ... -d ...
    python scripts/backup_cifrado.py restaurar <arquivo>.cifrado -- pg_restore -h ... -d ...
    python scripts/backup_cifrado.py descartar <arquivo>.cifrado --motivo "..."

`copiar` recebe a saida do `pg_dump` na memoria e grava so o arquivo cifrado;
`restaurar` decifra na memoria e entrega ao `pg_restore` pela entrada padrao.
Nenhum dos dois deixa copia aberta no disco.

`cifrar` serve para o dump que ja existe em claro: cifra e apaga o original.
`decifrar` grava uma copia aberta para ensaio - descarte-a assim que o ensaio
acabar (`descartar`), e o registro mostra que ela existiu.

Apagar sobrescreve o arquivo com zeros antes de remover. Em SSD isso nao
garante que o conteudo some do disco: a pasta de backups fica num disco
cifrado (BitLocker ou equivalente).

A senha vem de `PDCONNECT_BACKUP_SENHA` ou e pedida no terminal; nunca vai
para arquivo nem para o registro. Quem perde a senha perde o backup - e esse e
o ponto. A copia e guardada so ate o ensaio da migration dar certo; depois e
descartada, e `REGISTRO_DE_BACKUPS.md`, na mesma pasta, diz quando e por quem.

Cifra: AES-256-GCM, com a chave derivada da senha por scrypt e sal aleatorio.
"""
from __future__ import annotations

import argparse
import getpass
import hashlib
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

ASSINATURA = b'PDCB1'
REGISTRO = 'REGISTRO_DE_BACKUPS.md'
EXTENSAO = '.cifrado'
CUSTO_PADRAO = 2 ** 15
TAMANHO_MINIMO_DA_SENHA = 12


class SenhaIncorreta(Exception):
    """A senha nao abre este backup, ou o arquivo foi alterado."""


def _chave(senha: str, sal: bytes, custo: int) -> bytes:
    return Scrypt(salt=sal, length=32, n=custo, r=8, p=1).derive(senha.encode('utf-8'))


def _registrar(pasta: Path, acao: str, arquivo: Path, detalhe: str = '') -> None:
    caminho = pasta / REGISTRO
    novo = not caminho.exists()
    quem = os.environ.get('USERNAME') or os.environ.get('USER') or 'desconhecido'

    with caminho.open('a', encoding='utf-8') as registro:
        if novo:
            registro.write('# Registro de backups\n\n| Quando | Ação | Arquivo | Quem | Detalhe |\n|---|---|---|---|---|\n')

        registro.write(
            f'| {datetime.now():%Y-%m-%d %H:%M} | {acao} | {arquivo.name} | {quem} | {detalhe} |\n'
        )


def _apagar(caminho: Path) -> None:
    """Sobrescreve com zeros e remove. Ver a nota sobre SSD no topo."""
    caminho = Path(caminho)
    tamanho = caminho.stat().st_size

    with caminho.open('r+b') as arquivo:
        arquivo.write(bytes(tamanho))
        arquivo.flush()
        os.fsync(arquivo.fileno())

    caminho.unlink()


def _exigir_senha_forte(senha: str) -> None:
    if len(senha) < TAMANHO_MINIMO_DA_SENHA:
        raise ValueError(f'Use uma senha com pelo menos {TAMANHO_MINIMO_DA_SENHA} caracteres.')


def _gravar_cifrado(conteudo: bytes, destino: Path, senha: str, custo: int) -> Path:
    """Grava cifrado e confere que decifra; se nao decifrar, nada fica."""
    sal = os.urandom(16)
    nonce = os.urandom(12)
    custo_bytes = custo.to_bytes(4, 'big')

    cifrado = AESGCM(_chave(senha, sal, custo)).encrypt(nonce, conteudo, ASSINATURA)
    destino.write_bytes(ASSINATURA + custo_bytes + sal + nonce + cifrado)

    if _abrir(destino, senha) != conteudo:
        destino.unlink()
        raise RuntimeError('A conferência do arquivo cifrado falhou; nada foi apagado.')

    return destino


def _resumo(arquivo: Path) -> str:
    return f'sha256 {hashlib.sha256(arquivo.read_bytes()).hexdigest()[:16]}'


def cifrar_arquivo(origem: Path, senha: str, custo: int = CUSTO_PADRAO) -> Path:
    """Cifra, confere que decifra e so entao apaga a copia em texto aberto."""
    _exigir_senha_forte(senha)
    origem = Path(origem)
    destino = _gravar_cifrado(
        origem.read_bytes(), origem.with_name(origem.name + EXTENSAO), senha, custo
    )

    _apagar(origem)
    _registrar(origem.parent, 'cifrado', destino, _resumo(destino))

    return destino


def copiar_cifrado(
    comando: list[str], destino: Path, senha: str, custo: int = CUSTO_PADRAO
) -> Path:
    """
    Roda o `pg_dump` e cifra a saida dele, sem arquivo aberto no meio.

    `destino` e o nome do dump; o arquivo gravado leva `.cifrado` no fim.
    """
    _exigir_senha_forte(senha)
    destino = Path(destino)
    saida = subprocess.run(comando, stdout=subprocess.PIPE, check=True).stdout
    cifrado = _gravar_cifrado(saida, destino.with_name(destino.name + EXTENSAO), senha, custo)

    _registrar(destino.parent, 'copiado cifrado', cifrado, _resumo(cifrado))

    return cifrado


def restaurar_cifrado(arquivo: Path, comando: list[str], senha: str) -> None:
    """Decifra na memoria e entrega ao `pg_restore` pela entrada padrao."""
    arquivo = Path(arquivo)
    subprocess.run(comando, input=_abrir(arquivo, senha), check=True)
    _registrar(arquivo.parent, 'restaurado', arquivo, Path(comando[0]).name)


def _abrir(arquivo: Path, senha: str) -> bytes:
    bruto = Path(arquivo).read_bytes()

    if not bruto.startswith(ASSINATURA):
        raise SenhaIncorreta('Este arquivo não é um backup cifrado do P&D Connect.')

    custo = int.from_bytes(bruto[5:9], 'big')
    sal, nonce, cifrado = bruto[9:25], bruto[25:37], bruto[37:]

    try:
        return AESGCM(_chave(senha, sal, custo)).decrypt(nonce, cifrado, ASSINATURA)
    except InvalidTag as erro:
        raise SenhaIncorreta('A senha não abre este backup.') from erro


def decifrar_arquivo(arquivo: Path, destino: Path, senha: str) -> Path:
    """Grava uma copia aberta para ensaio. Prefira `restaurar_cifrado`."""
    destino = Path(destino)
    destino.write_bytes(_abrir(arquivo, senha))
    _registrar(
        Path(arquivo).parent,
        'decifrado para ensaio',
        Path(arquivo),
        f'{destino.name} - descartar ao fim do ensaio',
    )
    return destino


def descartar(arquivo: Path, motivo: str) -> None:
    arquivo = Path(arquivo)
    _apagar(arquivo)
    _registrar(arquivo.parent, 'descartado', arquivo, motivo)


def _senha(confirmar: bool = False) -> str:
    senha = os.environ.get('PDCONNECT_BACKUP_SENHA')

    if senha:
        return senha

    senha = getpass.getpass('Senha do backup: ')

    if confirmar and getpass.getpass('Repita a senha: ') != senha:
        sys.exit('As senhas não coincidem.')

    return senha


def main(argumentos=None) -> None:
    parser = argparse.ArgumentParser(description='Backup cifrado do banco, com registro.')
    acoes = parser.add_subparsers(dest='acao', required=True)

    copiar = acoes.add_parser('copiar')
    copiar.add_argument('destino')
    copiar.add_argument('comando', nargs=argparse.REMAINDER)

    restaurar = acoes.add_parser('restaurar')
    restaurar.add_argument('arquivo')
    restaurar.add_argument('comando', nargs=argparse.REMAINDER)

    cifrar = acoes.add_parser('cifrar')
    cifrar.add_argument('arquivo')

    decifrar = acoes.add_parser('decifrar')
    decifrar.add_argument('arquivo')
    decifrar.add_argument('destino')

    descarte = acoes.add_parser('descartar')
    descarte.add_argument('arquivo')
    descarte.add_argument('--motivo', required=True)

    opcoes = parser.parse_args(argumentos)
    comando = [parte for parte in getattr(opcoes, 'comando', []) if parte != '--']

    if opcoes.acao in ('copiar', 'restaurar') and not comando:
        sys.exit('Informe o comando depois de "--" (pg_dump ou pg_restore).')

    if opcoes.acao == 'copiar':
        print(copiar_cifrado(comando, Path(opcoes.destino), _senha(confirmar=True)))
    elif opcoes.acao == 'restaurar':
        restaurar_cifrado(Path(opcoes.arquivo), comando, _senha())
    elif opcoes.acao == 'cifrar':
        print(cifrar_arquivo(Path(opcoes.arquivo), _senha(confirmar=True)))
    elif opcoes.acao == 'decifrar':
        print(decifrar_arquivo(Path(opcoes.arquivo), Path(opcoes.destino), _senha()))
    else:
        descartar(Path(opcoes.arquivo), opcoes.motivo)


if __name__ == '__main__':
    main()
