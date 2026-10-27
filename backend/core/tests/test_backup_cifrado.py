"""
Backup com dado real so existe cifrado, e sai com registro.

A copia do banco e guardada so ate o ensaio da migration dar certo; depois e
descartada, e o registro diz quando e por quem.
"""
import sys
import tempfile
from pathlib import Path

from django.test import SimpleTestCase

from scripts.backup_cifrado import (
    REGISTRO,
    SenhaIncorreta,
    cifrar_arquivo,
    copiar_cifrado,
    decifrar_arquivo,
    descartar,
    restaurar_cifrado,
)

CUSTO_DE_TESTE = 2 ** 10


class BackupCifradoTests(SimpleTestCase):
    def setUp(self):
        self.pasta = tempfile.TemporaryDirectory()
        self.dump = Path(self.pasta.name) / 'neondb_2026-10-24.dump'
        self.dump.write_bytes(b'PGDMP conteudo do banco com dado pessoal')

    def tearDown(self):
        self.pasta.cleanup()

    def test_cifra_e_apaga_a_copia_em_claro(self):
        cifrado = cifrar_arquivo(self.dump, 'senha longa da equipe', custo=CUSTO_DE_TESTE)

        self.assertFalse(self.dump.exists())
        self.assertTrue(cifrado.exists())
        self.assertNotIn(b'dado pessoal', cifrado.read_bytes())

    def test_decifra_com_a_mesma_senha(self):
        cifrado = cifrar_arquivo(self.dump, 'senha longa da equipe', custo=CUSTO_DE_TESTE)
        destino = Path(self.pasta.name) / 'restaurado.dump'

        decifrar_arquivo(cifrado, destino, 'senha longa da equipe')

        self.assertEqual(destino.read_bytes(), b'PGDMP conteudo do banco com dado pessoal')

    def test_senha_errada_e_recusada(self):
        cifrado = cifrar_arquivo(self.dump, 'senha longa da equipe', custo=CUSTO_DE_TESTE)

        with self.assertRaises(SenhaIncorreta):
            decifrar_arquivo(cifrado, Path(self.pasta.name) / 'x.dump', 'outra senha')

    def test_cada_acao_fica_no_registro_sem_a_senha(self):
        cifrado = cifrar_arquivo(self.dump, 'senha longa da equipe', custo=CUSTO_DE_TESTE)
        descartar(cifrado, motivo='ensaio da migration concluído')

        registro = (Path(self.pasta.name) / REGISTRO).read_text(encoding='utf-8')

        self.assertIn('cifrado', registro)
        self.assertIn('descartado', registro)
        self.assertIn('ensaio da migration concluído', registro)
        self.assertNotIn('senha longa', registro)
        self.assertFalse(cifrado.exists())

    def test_copiar_cifra_a_saida_do_dump_sem_arquivo_aberto(self):
        self.dump.unlink()
        comando = [sys.executable, '-c', "import sys; sys.stdout.buffer.write(b'PGDMP dado pessoal')"]

        cifrado = copiar_cifrado(comando, self.dump, 'senha longa da equipe', custo=CUSTO_DE_TESTE)

        self.assertEqual(
            sorted(arquivo.name for arquivo in Path(self.pasta.name).iterdir()),
            sorted([cifrado.name, REGISTRO]),
        )
        self.assertNotIn(b'dado pessoal', cifrado.read_bytes())

    def test_restaurar_entrega_o_conteudo_ao_comando_pela_entrada(self):
        cifrado = cifrar_arquivo(self.dump, 'senha longa da equipe', custo=CUSTO_DE_TESTE)
        recebido = Path(self.pasta.name) / 'recebido.bin'
        comando = [
            sys.executable, '-c',
            'import sys; open(sys.argv[1], "wb").write(sys.stdin.buffer.read())',
            str(recebido),
        ]

        restaurar_cifrado(cifrado, comando, 'senha longa da equipe')

        self.assertEqual(recebido.read_bytes(), b'PGDMP conteudo do banco com dado pessoal')

    def test_senha_curta_e_recusada(self):
        with self.assertRaises(ValueError):
            cifrar_arquivo(self.dump, 'curta', custo=CUSTO_DE_TESTE)

        self.assertTrue(self.dump.exists())
