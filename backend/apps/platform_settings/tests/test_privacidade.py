"""
O aviso de privacidade e publico e diz quem e o encarregado de dados.

A lei pede informar finalidade, base legal, compartilhamento e direitos
(art. 9) e indicar o encarregado (art. 41). O texto mora na tela; o contato do
encarregado vem do cadastro de contatos de suporte.
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.platform_settings.models import ContatoSuporte


class PrivacidadeTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_e_publica(self):
        resposta = self.client.get(reverse('privacidade'))

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)

    def test_traz_o_encarregado_cadastrado_nos_contatos(self):
        ContatoSuporte.objects.create(
            nome='Joana Lima', email='dpo@ac2microbiologia.com.br',
            papel='Encarregado de dados (LGPD)',
        )
        ContatoSuporte.objects.create(
            nome='Suporte', email='suporte@ac2microbiologia.com.br', papel='Acesso',
        )

        dados = self.client.get(reverse('privacidade')).data

        self.assertEqual(dados['encarregado']['nome'], 'Joana Lima')
        self.assertEqual(dados['encarregado']['email'], 'dpo@ac2microbiologia.com.br')

    def test_sem_encarregado_indicado_devolve_vazio_e_os_contatos(self):
        dados = self.client.get(reverse('privacidade')).data

        self.assertIsNone(dados['encarregado'])
        self.assertTrue(dados['contatos'])

    def test_traz_os_prazos_de_retencao(self):
        dados = self.client.get(reverse('privacidade')).data

        self.assertEqual(
            dados['retencao'],
            {
                'eventos_conta_meses': 12,
                'anexos_apos_arquivamento_meses': 24,
            },
        )
