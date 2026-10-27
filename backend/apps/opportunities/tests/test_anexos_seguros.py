"""
Download de anexo so com login e so para quem alcanca a oportunidade.

Antes, com `DEBUG=True`, a pasta `/media/` era servida sem login, com o
caminho previsivel (ano, mes e nome original do arquivo): quem acertasse o nome
baixava o documento da empresa.
"""
import re
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.opportunities.models import AnexoOportunidade
from core.tests.builders import (
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
)

MEDIA_TEMP = tempfile.mkdtemp(prefix='pdconnect-anexos-')
PDF = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n'


@override_settings(MEDIA_ROOT=MEDIA_TEMP)
class AnexoSeguroTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_TEMP, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.vale_verde = OrganizacaoBuilder().demandante().chamada('Vale Verde').build()
        self.terra_boa = OrganizacaoBuilder().demandante().chamada('Terra Boa').build()

        self.demandante = UsuarioBuilder().demandante().na_organizacao(self.vale_verde).build()
        self.outro_demandante = (
            UsuarioBuilder().demandante().na_organizacao(self.terra_boa).build()
        )
        self.supervisor = UsuarioBuilder().supervisor().build()

        self.oportunidade = (
            OportunidadeBuilder()
            .externa(self.vale_verde)
            .criada_por(self.demandante)
            .build()
        )
        self.outra = (
            OportunidadeBuilder()
            .externa(self.terra_boa)
            .criada_por(self.outro_demandante)
            .build()
        )

        self.anexo = self.enviar(self.demandante, self.oportunidade, 'laudo-confidencial.pdf')

    def enviar(self, usuario, oportunidade, nome):
        self.client.force_authenticate(usuario)
        resposta = self.client.post(
            reverse('oportunidade-anexos', args=[oportunidade.codigo]),
            {'arquivo': SimpleUploadedFile(nome, PDF, content_type='application/pdf')},
            format='multipart',
        )
        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED, resposta.data)
        return AnexoOportunidade.objects.get(pk=resposta.data['id_anexo'])

    def baixar(self, usuario, oportunidade=None, anexo=None):
        self.client.force_authenticate(usuario)
        return self.client.get(
            reverse(
                'oportunidade-anexo-download',
                args=[(oportunidade or self.oportunidade).codigo, (anexo or self.anexo).pk],
            )
        )

    def test_quem_alcanca_a_oportunidade_baixa_como_download(self):
        resposta = self.baixar(self.demandante)

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertIn('attachment', resposta['Content-Disposition'])
        self.assertIn('laudo-confidencial.pdf', resposta['Content-Disposition'])
        self.assertEqual(b''.join(resposta.streaming_content), PDF)

    def test_supervisor_baixa(self):
        self.assertEqual(self.baixar(self.supervisor).status_code, status.HTTP_200_OK)

    def test_demandante_de_outra_empresa_nao_baixa(self):
        resposta = self.baixar(self.outro_demandante)

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)

    def test_sem_login_nao_baixa(self):
        resposta = self.baixar(None)

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_anexo_de_outra_oportunidade_nao_sai_pela_rota_da_minha(self):
        do_outro = self.enviar(self.outro_demandante, self.outra, 'outro.pdf')

        resposta = self.baixar(self.demandante, anexo=do_outro)

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)

    def test_o_arquivo_e_gravado_com_codigo_aleatorio_e_nao_com_o_nome(self):
        self.assertNotIn('laudo', self.anexo.arquivo.name)
        self.assertRegex(self.anexo.arquivo.name, r'^anexos/[0-9a-f]{32}\.pdf$')

    def test_a_pasta_de_anexos_nao_e_servida_direto(self):
        from config import urls

        rotas = [str(rota.pattern) for rota in urls.urlpatterns]

        self.assertFalse(any(re.search(r'media', rota) for rota in rotas))
