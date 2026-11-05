"""
O token de renovacao vive num cookie que o JavaScript nao le.

Antes ele ia no corpo da resposta e o front o guardava no localStorage: uma
falha de XSS levava a sessao inteira. Agora o navegador guarda o cookie
`HttpOnly`, so o manda para as rotas de acesso e nenhum script o enxerga.
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.cookie_de_sessao import CAMINHO, NOME
from apps.accounts.models import FinalidadeToken, Papel, TokenAcesso, Usuario

SENHA = 'Senha-Forte-2026!'


class CookieDeSessaoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.usuario = Usuario.objects.create_user(
            email='supervisor@ac2.example',
            nome='Rafael Antunes',
            papel=Papel.SUPERVISOR,
            password=SENHA,
        )

    def entrar(self):
        resposta = self.client.post(
            reverse('auth-token'),
            {'email': self.usuario.email, 'password': SENHA},
            format='json',
        )
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        return resposta

    def renovar(self, **cabecalhos):
        return self.client.post(reverse('auth-token-refresh'), {}, format='json', **cabecalhos)

    def test_o_login_entrega_o_acesso_no_corpo_e_a_renovacao_no_cookie(self):
        resposta = self.entrar()

        self.assertIn('access', resposta.data)
        self.assertNotIn('refresh', resposta.data)

        cookie = resposta.cookies[NOME]
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['path'], CAMINHO)
        self.assertEqual(cookie['samesite'], 'Lax')
        self.assertGreater(int(cookie['max-age']), 0)

    def test_a_renovacao_le_o_cookie_e_troca_por_um_novo(self):
        antigo = self.entrar().cookies[NOME].value

        resposta = self.renovar()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertIn('access', resposta.data)
        self.assertNotIn('refresh', resposta.data)
        self.assertNotEqual(resposta.cookies[NOME].value, antigo)

    def test_sem_cookie_a_renovacao_pede_novo_login(self):
        resposta = self.renovar()

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_pedido_de_outro_site_nao_renova_pelo_cookie(self):
        self.entrar()

        resposta = self.renovar(HTTP_ORIGIN='https://site-estranho.example')

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_pedido_do_front_autorizado_renova(self):
        self.entrar()

        resposta = self.renovar(HTTP_ORIGIN='http://localhost:5173')

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)

    def test_sair_revoga_a_renovacao_e_apaga_o_cookie(self):
        entrada = self.entrar()
        antigo = entrada.cookies[NOME].value
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {entrada.data["access"]}')

        resposta = self.client.post(reverse('auth-logout'), {}, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(resposta.cookies[NOME].value, '')

        self.client.cookies[NOME] = antigo
        self.assertEqual(self.renovar().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cliente_de_api_que_manda_no_corpo_recebe_no_corpo(self):
        refresh = self.entrar().cookies[NOME].value
        self.client.cookies.clear()

        resposta = self.client.post(
            reverse('auth-token-refresh'), {'refresh': refresh}, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertIn('refresh', resposta.data)


class SessaoDeOutraOrigemTests(TestCase):
    """
    Um formulario de outro site nao entra nem sai pela pessoa: sem isso, ele
    deixaria no navegador dela o cookie da conta de quem o montou.
    """

    def setUp(self):
        self.client = APIClient()
        self.usuario = Usuario.objects.create_user(
            email='supervisor@ac2.example', nome='Rafael Antunes', papel=Papel.SUPERVISOR, password=SENHA
        )

    def test_login_de_outro_site_e_recusado(self):
        resposta = self.client.post(
            reverse('auth-token'),
            {'email': self.usuario.email, 'password': SENHA},
            format='json',
            HTTP_ORIGIN='https://site-estranho.example',
        )

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn(NOME, resposta.cookies)

    def test_login_por_formulario_e_recusado(self):
        resposta = self.client.post(
            reverse('auth-token'), {'email': self.usuario.email, 'password': SENHA}
        )

        self.assertEqual(resposta.status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)

    def test_sair_a_partir_de_outro_site_e_recusado(self):
        self.client.force_authenticate(self.usuario)

        resposta = self.client.post(
            reverse('auth-logout'), {}, format='json', HTTP_ORIGIN='https://site-estranho.example'
        )

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)


class SenhaNovaEncerraSessoesTests(TestCase):
    """Trocar ou redefinir a senha derruba toda renovacao que existia."""

    setUp = CookieDeSessaoTests.setUp
    entrar = CookieDeSessaoTests.entrar
    renovar = CookieDeSessaoTests.renovar

    def test_redefinir_a_senha_encerra_todas_as_sessoes(self):
        antiga = RefreshToken.for_user(self.usuario)
        token = TokenAcesso.emitir(self.usuario, FinalidadeToken.RECUPERACAO)
        nova = 'Fermentacao#2027'

        self.client.post(
            reverse('auth-reset-password'),
            {'token': token.token, 'nova_senha': nova, 'confirmar_senha': nova},
            format='json',
        )

        self.assertTrue(BlacklistedToken.objects.filter(token__jti=antiga['jti']).exists())

    def test_trocar_a_senha_encerra_as_outras_e_mantem_esta(self):
        outra = RefreshToken.for_user(self.usuario)
        entrada = self.entrar()
        desta = entrada.cookies[NOME].value
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {entrada.data["access"]}')
        nova = 'Fermentacao#2027'

        resposta = self.client.post(
            reverse('auth-change-password'),
            {'senha_atual': SENHA, 'nova_senha': nova, 'confirmar_senha': nova},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=outra['jti']).exists())
        self.assertNotEqual(resposta.cookies[NOME].value, desta)
        self.assertEqual(self.renovar().status_code, status.HTTP_200_OK)

        self.client.cookies[NOME] = desta
        self.assertEqual(self.renovar().status_code, status.HTTP_401_UNAUTHORIZED)
