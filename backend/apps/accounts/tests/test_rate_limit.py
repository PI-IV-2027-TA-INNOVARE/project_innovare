"""
Trava de forca bruta nas rotas de autenticacao.

POR QUE A SUITE RODA COM A TRAVA DESLIGADA
------------------------------------------
`settings.py` zera `DEFAULT_THROTTLE_RATES` quando detecta execucao de teste. O
contador do throttle vive no cache, que e o mesmo processo para a suite inteira:
com a trava ligada, as dezenas de logins dos outros testes estourariam o limite
e derrubariam uns aos outros, com falha que depende da ordem de execucao.

Aqui ela e religada de proposito, com limite baixo e cache limpo a cada teste,
que e o unico lugar onde o comportamento importa.
"""
from unittest.mock import patch

from django.conf import settings
from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from apps.accounts.models import Papel, Usuario

SENHA = 'Bioinsumo!2026'


def com_limite(**taxas):
    """
    Religa o throttle so no teste decorado, com as taxas informadas.

    Troca o atributo de classe em vez de usar `override_settings`: o DRF le
    `DEFAULT_THROTTLE_RATES` uma unica vez, no import, e guarda em
    `SimpleRateThrottle.THROTTLE_RATES`. Mexer so no settings nao chega ate la.
    """
    return patch.object(
        SimpleRateThrottle,
        'THROTTLE_RATES',
        {**settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'], **taxas},
    )


class TravaDeAutenticacaoTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.usuario = Usuario.objects.create_user(
            email='rafael.antunes@ac2microbiologia.com.br',
            nome='Rafael Antunes',
            papel=Papel.SUPERVISOR,
            password=SENHA,
        )

    def tearDown(self):
        cache.clear()

    @com_limite(login='3/min')
    def test_login_para_de_aceitar_tentativa_apos_o_limite(self):
        url = reverse('auth-token')
        corpo = {'email': self.usuario.email, 'password': 'senha-errada'}

        for _ in range(3):
            resposta = self.client.post(url, corpo, format='json')
            self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)

        resposta = self.client.post(url, corpo, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @com_limite(login='2/min')
    def test_a_senha_certa_nao_escapa_da_trava(self):
        """Quem estourou o limite nao entra nem acertando a senha."""
        url = reverse('auth-token')

        for _ in range(2):
            self.client.post(
                url,
                {'email': self.usuario.email, 'password': 'senha-errada'},
                format='json',
            )

        resposta = self.client.post(
            url,
            {'email': self.usuario.email, 'password': SENHA},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertNotIn('access', resposta.data)

    @com_limite(recuperacao='2/hour')
    def test_recuperacao_de_senha_nao_vira_canhao_de_email(self):
        url = reverse('auth-forgot-password')
        corpo = {'email': self.usuario.email}

        for _ in range(2):
            resposta = self.client.post(url, corpo, format='json')
            self.assertEqual(resposta.status_code, status.HTTP_200_OK)

        enviados_ate_o_limite = len(mail.outbox)
        resposta = self.client.post(url, corpo, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(len(mail.outbox), enviados_ate_o_limite)

    @com_limite(login='1/min')
    def test_a_resposta_bloqueada_diz_quando_tentar_de_novo(self):
        """O tratador de erro do projeto nao pode engolir o Retry-After do DRF."""
        url = reverse('auth-token')
        corpo = {'email': self.usuario.email, 'password': 'senha-errada'}

        self.client.post(url, corpo, format='json')
        resposta = self.client.post(url, corpo, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn('Retry-After', resposta.headers)

    def test_a_suite_roda_com_a_trava_desligada(self):
        """Sem isto, os outros testes derrubariam uns aos outros pelo cache."""
        self.assertTrue(
            all(taxa is None for taxa in settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'].values())
        )
