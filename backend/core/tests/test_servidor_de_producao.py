"""
O servidor que atende em producao.

O `runserver` e servidor de desenvolvimento: uma thread por pedido, sem limite,
sem reciclagem e sem teto para cabecalho. A imagem subia com ele, e como root.
Este teste le a configuracao do gunicorn e o Dockerfile, que nao rodam na suite.
"""
import runpy
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.test import SimpleTestCase

from core.configuracao import CONEXOES_MAXIMAS_NO_POOL

BACKEND = Path(settings.BASE_DIR)


def configuracao(**ambiente):
    with mock.patch.dict('os.environ', ambiente, clear=False):
        return runpy.run_path(str(BACKEND / 'gunicorn.conf.py'))


class ServidorDeProducaoTests(SimpleTestCase):
    def test_atende_varios_pedidos_por_processo(self):
        servidor = configuracao()

        self.assertEqual(servidor['worker_class'], 'gthread')
        self.assertGreaterEqual(servidor['workers'], 2)
        self.assertGreaterEqual(servidor['threads'], 4)

    def test_as_threads_cabem_no_pool_de_conexoes_do_banco(self):
        """Thread sem conexao livre espera 10 s e responde erro."""
        self.assertLessEqual(configuracao()['threads'], CONEXOES_MAXIMAS_NO_POOL)

    def test_processos_e_threads_vem_do_ambiente(self):
        servidor = configuracao(WEB_CONCURRENCY='5', GUNICORN_THREADS='6', PORT='9100')

        self.assertEqual(servidor['workers'], 5)
        self.assertEqual(servidor['threads'], 6)
        self.assertEqual(servidor['bind'], '0.0.0.0:9100')

    def test_threads_pedidas_acima_do_pool_sao_cortadas(self):
        servidor = configuracao(GUNICORN_THREADS='64')

        self.assertEqual(servidor['threads'], CONEXOES_MAXIMAS_NO_POOL)

    def test_cabecalho_e_linha_do_pedido_tem_teto(self):
        servidor = configuracao()

        self.assertLessEqual(servidor['limit_request_line'], 4094)
        self.assertLessEqual(servidor['limit_request_fields'], 100)
        self.assertLessEqual(servidor['limit_request_field_size'], 8190)

    def test_o_processo_e_reciclado_e_a_conexao_ociosa_cai(self):
        servidor = configuracao()

        self.assertGreater(servidor['max_requests'], 0)
        self.assertGreater(servidor['max_requests_jitter'], 0)
        self.assertLessEqual(servidor['keepalive'], 5)

    def test_o_pedido_que_espera_a_ia_nao_e_derrubado(self):
        self.assertGreaterEqual(configuracao()['timeout'], 120)


class ImagemDoBackendTests(SimpleTestCase):
    def setUp(self):
        self.dockerfile = (BACKEND / 'Dockerfile').read_text(encoding='utf-8')

    def test_a_imagem_sobe_com_o_gunicorn(self):
        comando = [linha for linha in self.dockerfile.splitlines() if linha.startswith('CMD')]

        self.assertEqual(len(comando), 1)
        self.assertIn('gunicorn', comando[0])
        self.assertNotIn('runserver', self.dockerfile)

    def test_a_imagem_nao_roda_como_root(self):
        usuarios = [
            linha.split()[1]
            for linha in self.dockerfile.splitlines()
            if linha.startswith('USER')
        ]

        self.assertTrue(usuarios)
        self.assertNotIn(usuarios[-1], ('root', '0'))

    def test_o_gunicorn_esta_nas_dependencias(self):
        requisitos = (BACKEND / 'requirements.txt').read_text(encoding='utf-8')

        self.assertIn('\ngunicorn==', requisitos)
