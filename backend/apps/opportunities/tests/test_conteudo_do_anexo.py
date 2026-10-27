"""
O tipo do anexo e conferido pelo conteudo do arquivo e pela extensao.

Antes, valia o que o navegador declarava: um arquivo HTML entrava dizendo que
era PDF, e quem o abrisse rodava o que estivesse dentro.
"""
import io
import shutil
import tempfile
import zipfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.opportunities.models import AnexoOportunidade
from core.tests.builders import OportunidadeBuilder, OrganizacaoBuilder, UsuarioBuilder

MEDIA_TEMP = tempfile.mkdtemp(prefix='pdconnect-conteudo-')
PDF = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n'
PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 32
JPEG = b'\xff\xd8\xff\xe0' + b'\x00' * 32
HTML = b'<!doctype html><html><script>alert(1)</script></html>'

DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def zip_com(*nomes):
    memoria = io.BytesIO()

    with zipfile.ZipFile(memoria, 'w') as pacote:
        for nome in nomes:
            pacote.writestr(nome, '<xml/>')

    return memoria.getvalue()


@override_settings(MEDIA_ROOT=MEDIA_TEMP)
class ConteudoDoAnexoTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_TEMP, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        organizacao = OrganizacaoBuilder().demandante().build()
        self.demandante = UsuarioBuilder().demandante().na_organizacao(organizacao).build()
        self.oportunidade = (
            OportunidadeBuilder().externa(organizacao).criada_por(self.demandante).build()
        )
        self.client.force_authenticate(self.demandante)

    def enviar(self, nome, conteudo, declarado='application/pdf'):
        return self.client.post(
            reverse('oportunidade-anexos', args=[self.oportunidade.codigo]),
            {'arquivo': SimpleUploadedFile(nome, conteudo, content_type=declarado)},
            format='multipart',
        )

    def assertRecusado(self, resposta, codigo='anexo_conteudo_recusado'):
        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resposta.data['codigo'], codigo)
        self.assertFalse(AnexoOportunidade.objects.exists())

    def test_html_que_se_diz_pdf_e_recusado(self):
        self.assertRecusado(self.enviar('laudo.pdf', HTML))

    def test_pdf_com_extensao_de_outro_tipo_e_recusado(self):
        self.assertRecusado(self.enviar('laudo.png', PDF, declarado='image/png'))

    def test_extensao_fora_da_lista_e_recusada_mesmo_com_conteudo_aceito(self):
        self.assertRecusado(self.enviar('laudo.html', PDF), codigo='anexo_tipo_recusado')

    def test_o_tipo_gravado_e_o_do_conteudo_e_nao_o_declarado(self):
        resposta = self.enviar('foto.png', PNG, declarado='application/octet-stream')

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED, resposta.data)
        self.assertEqual(resposta.data['mime'], 'image/png')

    def test_jpeg_entra_com_as_duas_extensoes(self):
        self.assertEqual(self.enviar('a.jpg', JPEG, 'image/jpeg').status_code, 201)
        self.assertEqual(self.enviar('b.jpeg', JPEG, 'image/jpeg').status_code, 201)

    def test_documento_do_word_e_conferido_por_dentro(self):
        valido = self.enviar('plano.docx', zip_com('word/document.xml'), DOCX)
        self.assertEqual(valido.status_code, status.HTTP_201_CREATED, valido.data)
        self.assertEqual(valido.data['mime'], DOCX)

        AnexoOportunidade.objects.all().delete()
        self.assertRecusado(self.enviar('plano.docx', zip_com('qualquer.txt'), DOCX))

    def test_planilha_do_excel_nao_passa_por_documento_do_word(self):
        self.assertRecusado(self.enviar('dados.docx', zip_com('xl/workbook.xml'), DOCX))

        resposta = self.enviar('dados.xlsx', zip_com('xl/workbook.xml'), XLSX)
        self.assertEqual(resposta.data['mime'], XLSX)

    def test_texto_e_csv_entram_quando_sao_texto(self):
        texto = self.enviar('notas.txt', 'Perda média de 4%.'.encode('utf-8'), 'text/plain')
        csv = self.enviar('lotes.csv', 'lote;perda\n1;4%\n'.encode('utf-8'), 'application/vnd.ms-excel')

        self.assertEqual(texto.data['mime'], 'text/plain')
        self.assertEqual(csv.data['mime'], 'text/csv')

    def test_texto_com_marcacao_de_pagina_ou_binario_e_recusado(self):
        self.assertRecusado(self.enviar('notas.txt', HTML, 'text/plain'))
        self.assertRecusado(self.enviar('notas.txt', b'MZ\x00\x00\x90', 'text/plain'))

    def test_o_download_nao_roda_nada_no_navegador(self):
        anexo = self.enviar('laudo.pdf', PDF).data

        resposta = self.client.get(
            reverse('oportunidade-anexo-download', args=[self.oportunidade.codigo, anexo['id_anexo']])
        )

        self.assertIn('attachment', resposta['Content-Disposition'])
        self.assertEqual(resposta['X-Content-Type-Options'], 'nosniff')
        self.assertIn('sandbox', resposta['Content-Security-Policy'])
        self.assertEqual(resposta['Cache-Control'], 'no-store')
