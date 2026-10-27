"""
Documentacao da API e endereco do `/admin/` (S7 e S8).

Em producao, o esquema e a pagina da documentacao so abrem para o
Administrador; fora dela, ficam abertos para o front se guiar. O `/admin/` sai
da configuracao, para nao ficar no endereco que todo robo tenta.
"""
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from core.configuracao import AMBIENTE_PRODUCAO, caminho_do_admin
from core.tests.builders import UsuarioBuilder


class DocumentacaoDaApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def ler(self, usuario=None):
        if usuario is not None:
            self.client.force_authenticate(user=usuario)
        return self.client.get(reverse('schema'))

    @override_settings(DEBUG=True, EM_PRODUCAO=False)
    def test_no_desenvolvimento_local_a_documentacao_fica_aberta(self):
        self.assertEqual(self.ler().status_code, status.HTTP_200_OK)

    @override_settings(DEBUG=False, EM_PRODUCAO=False)
    def test_local_sem_debug_nao_e_desenvolvimento_e_fecha(self):
        """Um `.env` local apontado para o banco oficial nao abre o mapa da API."""
        self.assertIn(
            self.ler().status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    @override_settings(EM_PRODUCAO=True)
    def test_em_producao_quem_nao_entrou_nao_le(self):
        self.assertIn(
            self.ler().status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    @override_settings(EM_PRODUCAO=True)
    def test_em_producao_outros_papeis_nao_leem(self):
        resposta = self.ler(UsuarioBuilder().supervisor().build())

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(EM_PRODUCAO=True)
    def test_em_producao_o_administrador_le(self):
        resposta = self.ler(UsuarioBuilder().administrador().build())

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)

    @override_settings(EM_PRODUCAO=True)
    def test_em_producao_a_pagina_da_documentacao_tambem_fecha(self):
        resposta = self.client.get(reverse('swagger-ui'))

        self.assertIn(
            resposta.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


class CaminhoDoAdminTests(SimpleTestCase):
    def test_admin_fica_no_caminho_configurado(self):
        self.assertEqual(reverse('admin:index'), f'/{settings.ADMIN_URL}')

    def test_normaliza_as_barras(self):
        self.assertEqual(caminho_do_admin(' /painel-tecnico/ '), 'painel-tecnico/')

    def test_ausente_cai_no_padrao_que_o_settings_passa(self):
        self.assertEqual(caminho_do_admin('admin'), 'admin/')

    def test_recusa_a_raiz(self):
        with self.assertRaises(ImproperlyConfigured):
            caminho_do_admin('/')

    def test_recusa_caminho_da_api(self):
        with self.assertRaises(ImproperlyConfigured):
            caminho_do_admin('api/admin')

    def test_em_producao_recusa_o_endereco_padrao(self):
        with self.assertRaises(ImproperlyConfigured):
            caminho_do_admin('admin', AMBIENTE_PRODUCAO)

    def test_em_producao_aceita_caminho_proprio(self):
        self.assertEqual(
            caminho_do_admin('painel-tecnico-7f3a', AMBIENTE_PRODUCAO),
            'painel-tecnico-7f3a/',
        )
