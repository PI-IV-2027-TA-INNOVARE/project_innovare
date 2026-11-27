"""
O corpo do pedido tem tamanho maximo, conferido antes de ser lido.

Sem este limite o Django so barrava o JSON acima de 2,5 MB, e com erro 500 em
vez de recusa explicada, inclusive na rota de entrada, que e publica. O anexo
so era medido depois de o envio inteiro chegar.
"""
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from core.tests.builders import OportunidadeBuilder, UsuarioBuilder

MEDIA_TEMP = tempfile.mkdtemp(prefix='pdconnect-corpo-')
PDF = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n'


@override_settings(CORPO_MAXIMO_KB=4, ANEXO_TAMANHO_MAXIMO_MB=1, MEDIA_ROOT=MEDIA_TEMP)
class LimiteDeCorpoTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_TEMP, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.oportunidade = OportunidadeBuilder().interna().criada_por(self.supervisor).build()

    def entrar_com(self, senha):
        return self.client.post(
            reverse('auth-token'),
            {'email': 'ninguem@exemplo.com.br', 'password': senha},
            format='json',
        )

    def anexar(self, conteudo):
        self.client.force_authenticate(self.supervisor)

        return self.client.post(
            reverse('oportunidade-anexos', args=[self.oportunidade.codigo]),
            {'arquivo': SimpleUploadedFile('laudo.pdf', conteudo, content_type='application/pdf')},
            format='multipart',
        )

    def test_corpo_acima_do_limite_e_recusado_na_rota_publica(self):
        resposta = self.entrar_com('x' * 8192)

        self.assertEqual(resposta.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        self.assertEqual(resposta.json()['codigo'], 'corpo_grande_demais')

    def test_corpo_dentro_do_limite_segue_para_a_rota(self):
        resposta = self.entrar_com('senha-errada')

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_o_limite_vale_tambem_para_quem_tem_sessao(self):
        self.client.force_authenticate(self.supervisor)

        resposta = self.client.post(
            reverse('oportunidade-observacoes', args=[self.oportunidade.codigo]),
            {'texto': 'x' * 8192},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

    def test_o_envio_de_anexo_tem_o_limite_do_anexo_e_nao_o_geral(self):
        resposta = self.anexar(PDF + b'%' * (64 * 1024))

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED, resposta.data)

    def test_anexo_acima_do_limite_e_recusado_antes_de_ser_recebido(self):
        resposta = self.anexar(PDF + b'%' * (3 * 1024 * 1024))

        self.assertEqual(resposta.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        self.assertEqual(resposta.json()['codigo'], 'corpo_grande_demais')

    def test_pedido_sem_corpo_passa(self):
        resposta = self.client.get(reverse('configuracao-tema'))

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
