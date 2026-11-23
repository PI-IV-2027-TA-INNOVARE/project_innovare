"""
O aviso de privacidade e publico e diz quem e o encarregado de dados.

A lei pede informar finalidade, base legal, compartilhamento e direitos
(art. 9) e indicar o encarregado (art. 41). O texto mora na tela; o contato do
encarregado vem do cadastro de contatos de suporte.
"""
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.platform_settings.models import ContatoSuporte

GROQ_DE_TESTE = {
    'AI_PROVEDORES_COMPATIVEIS': ['groq'],
    'GROQ_API_KEY': 'chave-de-teste',
    'AI_GROQ_URL': 'https://groq.invalid/v1',
    'AI_GROQ_MODELO': 'modelo-de-teste',
    'AI_GROQ_ROTULO': 'Groq',
}


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

    def test_sem_servico_de_ia_ligado_a_lista_vem_vazia(self):
        dados = self.client.get(reverse('privacidade')).data

        self.assertEqual(dados['servicos_de_ia'], [])

    @override_settings(
        GEMINI_API_KEY='chave-de-teste', AI_PROVEDOR_RESERVA='groq', **GROQ_DE_TESTE
    )
    def test_lista_os_servicos_de_ia_que_a_configuracao_liga_na_ordem(self):
        """
        Quem recebe os textos muda com o `.env` de cada ambiente; o aviso
        acompanha a configuracao, e nao um nome escrito na tela.
        """
        dados = self.client.get(reverse('privacidade')).data

        self.assertEqual(
            dados['servicos_de_ia'],
            [
                {'nome': 'Google Gemini', 'papel': 'principal'},
                {'nome': 'Groq', 'papel': 'reserva'},
            ],
        )

    @override_settings(GEMINI_API_KEY='', AI_PROVEDOR_RESERVA='groq', **GROQ_DE_TESTE)
    def test_servico_sem_chave_nao_recebe_nada_e_nao_aparece(self):
        dados = self.client.get(reverse('privacidade')).data

        self.assertEqual(dados['servicos_de_ia'], [{'nome': 'Groq', 'papel': 'reserva'}])

    @override_settings(
        GEMINI_API_KEY='chave-de-teste', AI_PROVEDOR_RESERVA='', AI_MODELO_RESERVA='outro-modelo'
    )
    def test_o_mesmo_servico_com_outro_modelo_aparece_uma_vez(self):
        dados = self.client.get(reverse('privacidade')).data

        self.assertEqual(
            dados['servicos_de_ia'], [{'nome': 'Google Gemini', 'papel': 'principal'}]
        )

    def test_traz_os_prazos_de_retencao(self):
        dados = self.client.get(reverse('privacidade')).data

        self.assertEqual(
            dados['retencao'],
            {
                'eventos_conta_meses': 12,
                'anexos_apos_arquivamento_meses': 24,
            },
        )
