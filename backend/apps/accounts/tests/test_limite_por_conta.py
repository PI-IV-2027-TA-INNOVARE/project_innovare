"""
A entrada e a recuperacao de senha tem limite por conta, alem do limite por IP.

O limite por IP nao segura quem tenta a senha de uma mesma conta a partir de
muitos enderecos, nem quem pede o e-mail de recuperacao dela sem parar. Aqui a
conta e a chave: o e-mail digitado, exista a conta ou nao, para que o limite nao
revele quais e-mails estao cadastrados.

O `/admin/` do Django nao passa pelo DRF e nao tinha limite nenhum de tentativas.
"""
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from core.tests.builders import UsuarioBuilder

SENHA = 'Bioinsumo!2026'


class ComCacheLimpo(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def tearDown(self):
        cache.clear()


@override_settings(LIMITES_POR_CONTA={'entrada': '3/hour', 'recuperacao': '2/hour'})
class LimitePorContaTests(ComCacheLimpo):
    def setUp(self):
        super().setUp()
        self.usuario = UsuarioBuilder().supervisor().com_senha(SENHA).build()

    def entrar(self, email, senha, ip):
        return self.client.post(
            reverse('auth-token'),
            {'email': email, 'password': senha},
            format='json',
            REMOTE_ADDR=ip,
        )

    def recuperar(self, email, ip):
        return self.client.post(
            reverse('auth-forgot-password'), {'email': email}, format='json', REMOTE_ADDR=ip
        )

    def test_tentativas_de_varios_enderecos_contra_a_mesma_conta_sao_barradas(self):
        for final in range(3):
            resposta = self.entrar(self.usuario.email, 'senha-errada', f'10.0.0.{final}')
            self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)

        resposta = self.entrar(self.usuario.email, SENHA, '10.0.0.99')

        self.assertEqual(resposta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(resposta.data['codigo'], 'limite_de_pedidos')
        self.assertIn('Retry-After', resposta.headers)

    def test_caixa_e_espaco_no_email_nao_escapam_do_limite(self):
        for final in range(3):
            self.entrar(self.usuario.email, 'senha-errada', f'10.0.0.{final}')

        resposta = self.entrar(f'  {self.usuario.email.upper()} ', SENHA, '10.0.0.99')

        self.assertEqual(resposta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_o_limite_de_uma_conta_nao_fecha_a_outra(self):
        outra = UsuarioBuilder().supervisor().com_senha(SENHA).build()

        for final in range(3):
            self.entrar(self.usuario.email, 'senha-errada', f'10.0.0.{final}')

        self.assertEqual(
            self.entrar(outra.email, SENHA, '10.0.0.1').status_code, status.HTTP_200_OK
        )

    def test_email_sem_conta_e_limitado_do_mesmo_jeito(self):
        for final in range(3):
            self.entrar('ninguem@exemplo.com.br', 'senha-errada', f'10.0.0.{final}')

        resposta = self.entrar('ninguem@exemplo.com.br', 'senha-errada', '10.0.0.99')

        self.assertEqual(resposta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_recuperacao_da_mesma_conta_por_varios_enderecos_e_barrada(self):
        for final in range(2):
            self.assertEqual(
                self.recuperar(self.usuario.email, f'10.0.0.{final}').status_code,
                status.HTTP_200_OK,
            )

        enviados = len(mail.outbox)
        resposta = self.recuperar(self.usuario.email, '10.0.0.99')

        self.assertEqual(resposta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(len(mail.outbox), enviados)

    def test_pedir_recuperacao_nao_gasta_o_limite_de_entrada(self):
        for final in range(3):
            self.recuperar(self.usuario.email, f'10.0.0.{final}')

        self.assertEqual(
            self.entrar(self.usuario.email, SENHA, '10.0.0.4').status_code, status.HTTP_200_OK
        )

    def test_corpo_sem_email_nao_derruba_a_rota(self):
        resposta = self.client.post(reverse('auth-token'), {}, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)


class LimitePorContaDesligadoNaSuiteTests(ComCacheLimpo):
    def test_a_suite_roda_sem_o_limite_por_conta(self):
        usuario = UsuarioBuilder().supervisor().com_senha(SENHA).build()

        for _ in range(40):
            resposta = self.client.post(
                reverse('auth-token'),
                {'email': usuario.email, 'password': 'senha-errada'},
                format='json',
            )

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(LIMITE_DE_ENTRADA_NO_ADMIN='2/min')
class LimiteDeEntradaNoAdminTests(ComCacheLimpo):
    def tentar(self, ip='10.0.0.1'):
        return self.client.post(
            reverse('admin:login'),
            {'username': 'alguem@exemplo.com.br', 'password': 'senha-errada'},
            REMOTE_ADDR=ip,
        )

    def test_tentativas_seguidas_no_admin_sao_barradas(self):
        self.tentar()
        self.tentar()

        resposta = self.tentar()

        self.assertEqual(resposta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn('Retry-After', resposta.headers)

    def test_o_limite_do_admin_e_por_endereco(self):
        self.tentar()
        self.tentar()

        self.assertNotEqual(
            self.tentar('10.0.0.2').status_code, status.HTTP_429_TOO_MANY_REQUESTS
        )

    def test_abrir_a_tela_de_entrada_nao_conta(self):
        for _ in range(5):
            resposta = self.client.get(reverse('admin:login'))

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)

    def test_a_api_nao_e_afetada_pelo_limite_do_admin(self):
        self.tentar()
        self.tentar()
        self.tentar()

        resposta = self.client.get(reverse('configuracao-tema'), REMOTE_ADDR='10.0.0.1')

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
