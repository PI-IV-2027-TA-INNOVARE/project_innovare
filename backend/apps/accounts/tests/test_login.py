"""
Testes do acesso: login, perfil, situacao da conta e recuperacao de senha.

Nenhum destes testes toca banco remoto, SMTP real ou provedor de IA
(AGENTS.md 0.1) - o `settings` forca locmem/SQLite quando detecta execucao de
teste.
"""
from django.core import mail
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import (
    FinalidadeToken,
    Papel,
    SituacaoConta,
    TokenAcesso,
    Usuario,
)
from apps.audit.models import EventoAuditoria

SENHA = 'Bioinsumo!2026'


class LoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.usuario = Usuario.objects.create_user(
            email='Rafael.Antunes@ac2microbiologia.com.br',
            nome='Rafael Antunes',
            papel=Papel.SUPERVISOR,
            password=SENHA,
        )

    def test_login_devolve_par_de_tokens_e_papel(self):
        resposta = self.client.post(
            reverse('auth-token'),
            {'email': 'rafael.antunes@ac2microbiologia.com.br', 'password': SENHA},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertIn('access', resposta.data)
        self.assertIn('refresh', resposta.data)
        self.assertEqual(resposta.data['papel'], Papel.SUPERVISOR)

    def test_email_e_caso_insensitivo(self):
        """O e-mail e normalizado em minusculas na gravacao."""
        resposta = self.client.post(
            reverse('auth-token'),
            {'email': 'RAFAEL.ANTUNES@AC2MICROBIOLOGIA.COM.BR', 'password': SENHA},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)

    def test_senha_errada_nao_autentica(self):
        resposta = self.client.post(
            reverse('auth-token'),
            {'email': self.usuario.email, 'password': 'senha-errada'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_carimba_ultimo_acesso_e_registra_evento(self):
        self.assertIsNone(self.usuario.ultimo_acesso)

        self.client.post(
            reverse('auth-token'),
            {'email': self.usuario.email, 'password': SENHA},
            format='json',
        )

        self.usuario.refresh_from_db()
        self.assertIsNotNone(self.usuario.ultimo_acesso)
        self.assertTrue(
            EventoAuditoria.objects.filter(
                categoria='conta', tipo='login', entidade_id=str(self.usuario.pk)
            ).exists()
        )

    def test_conta_suspensa_nao_faz_login(self):
        self.usuario.situacao = SituacaoConta.SUSPENSO
        self.usuario.save(update_fields=['situacao'])

        resposta = self.client.post(
            reverse('auth-token'),
            {'email': self.usuario.email, 'password': SENHA},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_suspensao_invalida_token_ja_emitido(self):
        """
        A tela de admin oferece "suspender" como acao imediata. Sem verificacao
        por requisicao, o token vigente continuaria valendo ate expirar.
        """
        login = self.client.post(
            reverse('auth-token'),
            {'email': self.usuario.email, 'password': SENHA},
            format='json',
        )
        access = login.data['access']

        self.usuario.situacao = SituacaoConta.SUSPENSO
        self.usuario.save(update_fields=['situacao'])

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        resposta = self.client.get(reverse('auth-profile'))

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)


class PerfilTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.usuario = Usuario.objects.create_user(
            email='maria.ferreira@ac2microbiologia.com.br',
            nome='Maria Ferreira',
            papel=Papel.PESQUISADOR,
            password=SENHA,
        )
        self.client.force_authenticate(self.usuario)

    def test_perfil_devolve_papel_entre_os_quatro_atores(self):
        resposta = self.client.get(reverse('auth-profile'))

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['papel'], Papel.PESQUISADOR)
        self.assertEqual(resposta.data['papel_rotulo'], 'Pesquisador')
        self.assertEqual(resposta.data['email'], self.usuario.email)

    def test_perfil_traz_as_permissoes_efetivas_do_papel(self):
        resposta = self.client.get(reverse('auth-profile'))

        permissoes = resposta.data['permissoes']
        self.assertIn('perfil.editar_proprio', permissoes)
        self.assertNotIn('decisao.registrar', permissoes)
        self.assertNotIn('matching.executar', permissoes)
        self.assertNotIn('conta.gerenciar', permissoes)

    def test_perfil_exige_autenticacao(self):
        self.client.force_authenticate(None)

        resposta = self.client.get(reverse('auth-profile'))

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)


class RecuperacaoDeSenhaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.usuario = Usuario.objects.create_user(
            email='helena.torres@ac2microbiologia.com.br',
            nome='Helena Torres',
            papel=Papel.PESQUISADOR,
            password=SENHA,
        )

    def test_solicitacao_emite_token_e_envia_email(self):
        resposta = self.client.post(
            reverse('auth-forgot-password'),
            {'email': self.usuario.email},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(
            TokenAcesso.objects.filter(
                usuario=self.usuario, finalidade=FinalidadeToken.RECUPERACAO
            ).count(),
            1,
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.usuario.email, mail.outbox[0].to)

    def test_email_inexistente_responde_igual_e_nao_envia_nada(self):
        """
        O formulario publico nao pode virar verificador de contas: a resposta e
        a mesma exista ou nao o e-mail.
        """
        resposta = self.client.post(
            reverse('auth-forgot-password'),
            {'email': 'ninguem@exemplo.com'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

    def test_redefinicao_troca_a_senha_e_consome_o_token(self):
        token = TokenAcesso.emitir(self.usuario, FinalidadeToken.RECUPERACAO)
        nova = 'Fermentacao#2027'

        resposta = self.client.post(
            reverse('auth-reset-password'),
            {'token': token.token, 'nova_senha': nova, 'confirmar_senha': nova},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.usuario.refresh_from_db()
        self.assertTrue(self.usuario.check_password(nova))

        token.refresh_from_db()
        self.assertIsNotNone(token.usado_em)
        self.assertFalse(token.valido)

    def test_token_nao_serve_duas_vezes(self):
        token = TokenAcesso.emitir(self.usuario, FinalidadeToken.RECUPERACAO)
        nova = 'Fermentacao#2027'
        payload = {'token': token.token, 'nova_senha': nova, 'confirmar_senha': nova}

        self.client.post(reverse('auth-reset-password'), payload, format='json')
        resposta = self.client.post(
            reverse('auth-reset-password'), payload, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resposta.data['codigo'], 'token_expirado')

    def test_nova_solicitacao_invalida_o_token_anterior(self):
        antigo = TokenAcesso.emitir(self.usuario, FinalidadeToken.RECUPERACAO)
        TokenAcesso.emitir(self.usuario, FinalidadeToken.RECUPERACAO)

        antigo.refresh_from_db()
        self.assertFalse(antigo.valido)

    def test_senhas_divergentes_sao_recusadas(self):
        token = TokenAcesso.emitir(self.usuario, FinalidadeToken.RECUPERACAO)

        resposta = self.client.post(
            reverse('auth-reset-password'),
            {
                'token': token.token,
                'nova_senha': 'Fermentacao#2027',
                'confirmar_senha': 'Outra#2027',
            },
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)


class AlteracaoDeSenhaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.usuario = Usuario.objects.create_user(
            email='pedro.salgado@ac2microbiologia.com.br',
            nome='Pedro Salgado',
            papel=Papel.PESQUISADOR,
            password=SENHA,
        )
        self.client.force_authenticate(self.usuario)

    def test_troca_com_senha_atual_correta(self):
        nova = 'Microbiota@2027'

        resposta = self.client.post(
            reverse('auth-change-password'),
            {'senha_atual': SENHA, 'nova_senha': nova, 'confirmar_senha': nova},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.usuario.refresh_from_db()
        self.assertTrue(self.usuario.check_password(nova))

    def test_senha_atual_incorreta_bloqueia(self):
        nova = 'Microbiota@2027'

        resposta = self.client.post(
            reverse('auth-change-password'),
            {'senha_atual': 'errada', 'nova_senha': nova, 'confirmar_senha': nova},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.usuario.refresh_from_db()
        self.assertTrue(self.usuario.check_password(SENHA))


class ConviteDeAcessoTests(TestCase):
    """
    RN-A04: a conta nasce sem senha utilizavel e a pessoa a define pelo token
    de convite. Nao existe autocadastro.
    """

    def setUp(self):
        self.client = APIClient()
        self.usuario = Usuario.objects.create_user(
            email='novo.membro@ac2microbiologia.com.br',
            nome='Novo Membro',
            papel=Papel.PESQUISADOR,
        )

    def test_conta_provisionada_nasce_sem_senha_utilizavel(self):
        self.assertFalse(self.usuario.has_usable_password())

    def test_token_de_convite_define_a_primeira_senha(self):
        token = TokenAcesso.emitir(self.usuario, FinalidadeToken.CONVITE)
        senha = 'PrimeiroAcesso#2026'

        resposta = self.client.post(
            reverse('auth-reset-password'),
            {'token': token.token, 'nova_senha': senha, 'confirmar_senha': senha},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.usuario.refresh_from_db()
        self.assertTrue(self.usuario.check_password(senha))

    def test_convite_e_recuperacao_convivem_sem_se_invalidar(self):
        convite = TokenAcesso.emitir(self.usuario, FinalidadeToken.CONVITE)
        TokenAcesso.emitir(self.usuario, FinalidadeToken.RECUPERACAO)

        convite.refresh_from_db()
        self.assertTrue(convite.valido)


class CatalogoDePermissoesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.usuario = Usuario.objects.create_user(
            email='admin@ac2microbiologia.com.br',
            nome='Administracao da plataforma',
            papel=Papel.ADMINISTRADOR,
            password=SENHA,
        )
        self.client.force_authenticate(self.usuario)

    def test_catalogo_lista_chave_e_papeis(self):
        resposta = self.client.get(reverse('permissoes-catalogo'))

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        chaves = {item['chave'] for item in resposta.data['permissoes']}
        self.assertIn('decisao.registrar', chaves)
        self.assertIn('conta.gerenciar', chaves)

    def test_administrador_nao_entra_no_fluxo_cientifico(self):
        """
        `CONTEXT.md` secao 3: o Administrador administra contas e configuracao;
        nao ve nem decide oportunidade.
        """
        resposta = self.client.get(reverse('auth-profile'))

        permissoes = resposta.data['permissoes']
        self.assertIn('conta.gerenciar', permissoes)
        self.assertNotIn('decisao.registrar', permissoes)
        self.assertNotIn('oportunidade.ver_fila', permissoes)


class EncerramentoDeSessaoTests(TestCase):
    """PB02: encerrar a sessao invalida o refresh, nao so o estado do navegador."""

    def setUp(self):
        self.client = APIClient()
        self.senha = SENHA
        self.usuario = Usuario.objects.create_user(
            email='supervisor@ac2microbiologia.com.br',
            nome='Rafael Antunes',
            papel=Papel.SUPERVISOR,
            password=self.senha,
        )

    def autenticar(self):
        resposta = self.client.post(
            reverse('auth-token'),
            {'email': self.usuario.email, 'password': self.senha},
            format='json',
        )
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        return resposta.data['access'], resposta.data['refresh']

    def test_logout_invalida_o_refresh(self):
        access, refresh = self.autenticar()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

        resposta = self.client.post(
            reverse('auth-logout'), {'refresh': refresh}, format='json'
        )
        self.assertEqual(resposta.status_code, status.HTTP_204_NO_CONTENT)

        renovacao = self.client.post(
            reverse('auth-token-refresh'), {'refresh': refresh}, format='json'
        )
        self.assertEqual(renovacao.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_de_outra_conta_nao_e_aceito(self):
        _, refresh = self.autenticar()

        outro = Usuario.objects.create_user(
            email='outro@ac2microbiologia.com.br',
            nome='Outra Pessoa',
            papel=Papel.SUPERVISOR,
            password=self.senha,
        )
        entrada = self.client.post(
            reverse('auth-token'),
            {'email': outro.email, 'password': self.senha},
            format='json',
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {entrada.data["access"]}')

        resposta = self.client.post(
            reverse('auth-logout'), {'refresh': refresh}, format='json'
        )
        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resposta.data['codigo'], 'refresh_invalido')

        renovacao = self.client.post(
            reverse('auth-token-refresh'), {'refresh': refresh}, format='json'
        )
        self.assertEqual(renovacao.status_code, status.HTTP_200_OK)

    def test_logout_exige_autenticacao(self):
        _, refresh = self.autenticar()

        resposta = self.client.post(
            reverse('auth-logout'), {'refresh': refresh}, format='json'
        )
        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)
