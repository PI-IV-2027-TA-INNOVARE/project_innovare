"""
`HEAD` so le, mesmo com corpo.

O DRF manda o `HEAD` para a mesma action do `GET`, e le o corpo em qualquer
metodo. As rotas que gravavam em "tudo que nao e GET" gravavam tambem com
`HEAD`, e a permissao de leitura deixava o Pesquisador da equipe anexar
documento e reescrever a proposta. Nas rotas da oportunidade, `HEAD` nao e
aceito, e a gravacao so acontece no metodo de escrita.

Nada toca banco remoto (AGENTS.md 0.1).
"""
import json
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.test.client import BOUNDARY, MULTIPART_CONTENT, encode_multipart
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.copilot.models import PropostaEstruturada
from apps.matching.models import EquipePotencial, MembroEquipe
from apps.network.models import PapelNaRede
from apps.opportunities.models import AnexoOportunidade
from core.tests.builders import MembroRedeBuilder, OportunidadeBuilder, UsuarioBuilder

MEDIA_TEMP = tempfile.mkdtemp(prefix='pdconnect-head-')
PDF = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n'


@override_settings(MEDIA_ROOT=MEDIA_TEMP)
class HeadSoLeTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_TEMP, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.pesquisador = UsuarioBuilder().pesquisador().build()
        self.oportunidade = OportunidadeBuilder().interna().build()
        MembroEquipe.objects.create(
            equipe=EquipePotencial.objects.create(oportunidade=self.oportunidade),
            membro=MembroRedeBuilder().pesquisador().com_acesso(self.pesquisador).build(),
            papel=PapelNaRede.PESQUISADOR,
        )
        self.client.force_authenticate(self.pesquisador)

    def test_head_com_arquivo_nao_anexa(self):
        corpo = encode_multipart(
            BOUNDARY,
            {'arquivo': SimpleUploadedFile('tentativa.pdf', PDF, content_type='application/pdf')},
        )

        resposta = self.client.generic(
            'HEAD',
            reverse('oportunidade-anexos', args=[self.oportunidade.codigo]),
            corpo,
            content_type=MULTIPART_CONTENT,
        )

        self.assertEqual(resposta.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertFalse(AnexoOportunidade.objects.filter(enviado_por=self.pesquisador).exists())

    def test_head_com_corpo_nao_reescreve_a_proposta(self):
        proposta = PropostaEstruturada.objects.create(
            oportunidade=self.oportunidade, problema_pesquisa='original'
        )

        resposta = self.client.generic(
            'HEAD',
            reverse('oportunidade-proposta', args=[self.oportunidade.codigo]),
            json.dumps({'problema_pesquisa': 'trocado'}),
            content_type='application/json',
        )

        proposta.refresh_from_db()
        self.assertEqual(resposta.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(proposta.problema_pesquisa, 'original')
        self.assertFalse(proposta.revisada_por_humano)
