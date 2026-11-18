"""
O envio de anexo tem limite de pedidos proprio e cota por oportunidade (N2).

Com o limite geral, uma conta enviava 240 arquivos de 10 MB por minuto: o disco
enchia antes de alguem notar. O limite conta so o envio; ler e baixar nao.
"""
import shutil
import tempfile

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.opportunities.models import AnexoOportunidade
from core.tests.builders import OportunidadeBuilder, UsuarioBuilder

MEDIA_TEMP = tempfile.mkdtemp(prefix='pdconnect-cota-')
PDF = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n'


@override_settings(MEDIA_ROOT=MEDIA_TEMP)
class ComAnexos(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_TEMP, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.oportunidade = OportunidadeBuilder().interna().criada_por(self.supervisor).build()
        self.client.force_authenticate(self.supervisor)

    def tearDown(self):
        cache.clear()

    def url(self, oportunidade=None):
        return reverse('oportunidade-anexos', args=[(oportunidade or self.oportunidade).codigo])

    def enviar(self, oportunidade=None):
        return self.client.post(
            self.url(oportunidade),
            {'arquivo': SimpleUploadedFile('laudo.pdf', PDF, content_type='application/pdf')},
            format='multipart',
        )


@override_settings(LIMITE_DE_ANEXOS='2/hour')
class LimiteDeEnvioDeAnexoTests(ComAnexos):
    def test_passado_o_limite_o_envio_responde_429(self):
        self.enviar()
        self.enviar()

        resposta = self.enviar()

        self.assertEqual(resposta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(resposta.data['codigo'], 'limite_de_pedidos')
        self.assertEqual(AnexoOportunidade.objects.count(), 2)

    def test_ler_a_lista_nao_conta_no_limite(self):
        self.enviar()
        self.enviar()

        self.assertEqual(self.client.get(self.url()).status_code, status.HTTP_200_OK)

    def test_o_limite_e_de_cada_pessoa(self):
        self.enviar()
        self.enviar()

        self.client.force_authenticate(UsuarioBuilder().supervisor().build())

        self.assertEqual(self.enviar().status_code, status.HTTP_201_CREATED)


@override_settings(ANEXO_LIMITE_POR_OPORTUNIDADE=2)
class CotaDeAnexosTests(ComAnexos):
    def test_a_oportunidade_recusa_anexo_alem_da_cota(self):
        self.enviar()
        self.enviar()

        resposta = self.enviar()

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resposta.data['codigo'], 'anexo_cota_atingida')
        self.assertIn('2 documentos', resposta.data['detail'])
        self.assertEqual(self.oportunidade.anexos.count(), 2)

    def test_a_cota_e_de_cada_oportunidade(self):
        self.enviar()
        self.enviar()

        outra = OportunidadeBuilder().interna().criada_por(self.supervisor).build()

        self.assertEqual(self.enviar(outra).status_code, status.HTTP_201_CREATED)

    @override_settings(ANEXO_LIMITE_POR_OPORTUNIDADE=0)
    def test_zero_desliga_a_cota(self):
        for _ in range(3):
            resposta = self.enviar()

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
