"""
Testes da administracao de contas (`/api/usuarios/`).

Quem opera estas rotas e o Administrador. Ele provisiona quem *opera a
plataforma*; quem faz ciencia entra pela rede interna, pelas maos do Supervisor
(RN-A04).
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


class BaseContas(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = Usuario.objects.create_user(
            email='admin@ac2microbiologia.com.br',
            nome='Administracao da plataforma',
            papel=Papel.ADMINISTRADOR,
            password=SENHA,
        )
        self.client.force_authenticate(self.admin)


class PermissaoDeContasTests(BaseContas):
    def test_administrador_lista_contas(self):
        resposta = self.client.get(reverse('usuario-list'))

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)

    def test_supervisor_nao_gerencia_contas(self):
        """`CONTEXT.md` secao 3: gerenciar contas e so do Administrador."""
        supervisor = Usuario.objects.create_user(
            email='rafael@ac2microbiologia.com.br',
            nome='Rafael Antunes',
            papel=Papel.SUPERVISOR,
            password=SENHA,
        )
        self.client.force_authenticate(supervisor)

        resposta = self.client.get(reverse('usuario-list'))

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_pesquisador_nao_gerencia_contas(self):
        pesquisador = Usuario.objects.create_user(
            email='maria@ac2microbiologia.com.br',
            nome='Maria Ferreira',
            papel=Papel.PESQUISADOR,
            password=SENHA,
        )
        self.client.force_authenticate(pesquisador)

        resposta = self.client.get(reverse('usuario-list'))

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonimo_nao_gerencia_contas(self):
        self.client.force_authenticate(None)

        resposta = self.client.get(reverse('usuario-list'))

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)


class ProvisionamentoTests(BaseContas):
    def test_cria_supervisor_sem_senha_utilizavel(self):
        resposta = self.client.post(
            reverse('usuario-list'),
            {
                'nome': 'Rafael Antunes',
                'email': 'Rafael.Antunes@ac2microbiologia.com.br',
                'papel': Papel.SUPERVISOR,
            },
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)

        criado = Usuario.objects.get(email='rafael.antunes@ac2microbiologia.com.br')
        self.assertEqual(criado.papel, Papel.SUPERVISOR)
        self.assertEqual(criado.situacao, SituacaoConta.ATIVO)
        self.assertFalse(criado.has_usable_password())

    def test_criacao_emite_convite_e_envia_email(self):
        self.client.post(
            reverse('usuario-list'),
            {
                'nome': 'Rafael Antunes',
                'email': 'rafael.antunes@ac2microbiologia.com.br',
                'papel': Papel.SUPERVISOR,
            },
            format='json',
        )

        criado = Usuario.objects.get(email='rafael.antunes@ac2microbiologia.com.br')
        token = TokenAcesso.objects.get(
            usuario=criado, finalidade=FinalidadeToken.CONVITE
        )
        self.assertTrue(token.valido)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(criado.email, mail.outbox[0].to)
        self.assertIn(token.token, mail.outbox[0].body)

    def test_convite_define_a_primeira_senha_e_libera_o_login(self):
        """O fluxo inteiro: Administrador convida, a pessoa entra."""
        self.client.post(
            reverse('usuario-list'),
            {
                'nome': 'Rafael Antunes',
                'email': 'rafael.antunes@ac2microbiologia.com.br',
                'papel': Papel.SUPERVISOR,
            },
            format='json',
        )
        token = TokenAcesso.objects.get(finalidade=FinalidadeToken.CONVITE)

        anonimo = APIClient()
        nova = 'PrimeiroAcesso#2026'
        definir = anonimo.post(
            reverse('auth-reset-password'),
            {'token': token.token, 'nova_senha': nova, 'confirmar_senha': nova},
            format='json',
        )
        self.assertEqual(definir.status_code, status.HTTP_200_OK)

        login = anonimo.post(
            reverse('auth-token'),
            {'email': 'rafael.antunes@ac2microbiologia.com.br', 'password': nova},
            format='json',
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.assertEqual(login.data['papel'], Papel.SUPERVISOR)

    def test_administrador_nao_cria_conta_de_pesquisador(self):
        """
        RN-A04 / `CONTEXT.md` secao 3.

        Uma conta de Pesquisador criada aqui nasceria sem `membro_rede`: a
        pessoa logaria e nao teria perfil, competencias nem vinculo. O caminho
        e o Supervisor cadastrar na rede e liberar o acesso.
        """
        resposta = self.client.post(
            reverse('usuario-list'),
            {
                'nome': 'Maria Ferreira',
                'email': 'maria.ferreira@ac2microbiologia.com.br',
                'papel': Papel.PESQUISADOR,
            },
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('papel', resposta.data)
        self.assertFalse(
            Usuario.objects.filter(
                email='maria.ferreira@ac2microbiologia.com.br'
            ).exists()
        )
        self.assertEqual(len(mail.outbox), 0)

    def test_email_repetido_e_recusado(self):
        resposta = self.client.post(
            reverse('usuario-list'),
            {
                'nome': 'Outro nome',
                'email': self.admin.email,
                'papel': Papel.SUPERVISOR,
            },
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_criacao_entra_na_trilha_de_auditoria(self):
        self.client.post(
            reverse('usuario-list'),
            {
                'nome': 'Rafael Antunes',
                'email': 'rafael.antunes@ac2microbiologia.com.br',
                'papel': Papel.SUPERVISOR,
            },
            format='json',
        )

        evento = EventoAuditoria.objects.get(categoria='conta', tipo='conta_criada')
        self.assertEqual(evento.ator, self.admin.email)
        self.assertEqual(evento.detalhe['papel'], Papel.SUPERVISOR)


class SituacaoDaContaTests(BaseContas):
    def setUp(self):
        super().setUp()
        self.supervisor = Usuario.objects.create_user(
            email='rafael.antunes@ac2microbiologia.com.br',
            nome='Rafael Antunes',
            papel=Papel.SUPERVISOR,
            password=SENHA,
        )

    def _url(self, usuario):
        return reverse('usuario-situacao', args=[usuario.pk])

    def test_suspender_conta(self):
        resposta = self.client.post(
            self._url(self.supervisor),
            {'situacao': SituacaoConta.SUSPENSO},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.supervisor.refresh_from_db()
        self.assertEqual(self.supervisor.situacao, SituacaoConta.SUSPENSO)
        self.assertFalse(self.supervisor.is_active)

    def test_suspensao_derruba_a_sessao_em_curso(self):
        """A tela de admin oferece suspender como acao imediata; tem de valer ja."""
        outro = APIClient()
        login = outro.post(
            reverse('auth-token'),
            {'email': self.supervisor.email, 'password': SENHA},
            format='json',
        )
        outro.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')
        self.assertEqual(
            outro.get(reverse('auth-profile')).status_code, status.HTTP_200_OK
        )

        self.client.post(
            self._url(self.supervisor),
            {'situacao': SituacaoConta.SUSPENSO},
            format='json',
        )

        self.assertEqual(
            outro.get(reverse('auth-profile')).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_reativar_conta(self):
        self.supervisor.situacao = SituacaoConta.INATIVO
        self.supervisor.save(update_fields=['situacao'])

        self.client.post(
            self._url(self.supervisor),
            {'situacao': SituacaoConta.ATIVO},
            format='json',
        )

        self.supervisor.refresh_from_db()
        self.assertEqual(self.supervisor.situacao, SituacaoConta.ATIVO)

    def test_administrador_nao_desativa_a_propria_conta(self):
        """
        O acidente classico: o Administrador se tranca do lado de fora e nao ha
        rota publica para voltar.
        """
        resposta = self.client.post(
            self._url(self.admin),
            {'situacao': SituacaoConta.SUSPENSO},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.situacao, SituacaoConta.ATIVO)

    def test_situacao_invalida_e_recusada(self):
        resposta = self.client.post(
            self._url(self.supervisor), {'situacao': 'ferias'}, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mudanca_de_situacao_entra_na_trilha(self):
        self.client.post(
            self._url(self.supervisor),
            {'situacao': SituacaoConta.SUSPENSO},
            format='json',
        )

        evento = EventoAuditoria.objects.get(
            categoria='conta', tipo='situacao_alterada'
        )
        self.assertEqual(evento.ator, self.admin.email)
        self.assertEqual(evento.detalhe['de'], SituacaoConta.ATIVO)
        self.assertEqual(evento.detalhe['para'], SituacaoConta.SUSPENSO)


class EdicaoDeContaTests(BaseContas):
    def setUp(self):
        super().setUp()
        self.supervisor = Usuario.objects.create_user(
            email='rafael.antunes@ac2microbiologia.com.br',
            nome='Rafael Antunes',
            papel=Papel.SUPERVISOR,
        )

    def test_edita_nome(self):
        resposta = self.client.patch(
            reverse('usuario-detail', args=[self.supervisor.pk]),
            {'nome': 'Rafael A. Antunes'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.supervisor.refresh_from_db()
        self.assertEqual(self.supervisor.nome, 'Rafael A. Antunes')

    def test_nao_promove_conta_existente_a_pesquisador(self):
        """Mesma invariante da criacao: Pesquisador so nasce com vinculo de rede."""
        resposta = self.client.patch(
            reverse('usuario-detail', args=[self.supervisor.pk]),
            {'papel': Papel.PESQUISADOR},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.supervisor.refresh_from_db()
        self.assertEqual(self.supervisor.papel, Papel.SUPERVISOR)

    def test_situacao_nao_muda_pelo_patch(self):
        """
        Ativar e suspender tem rota propria, que audita a transicao. Deixar a
        coluna editavel no PATCH criaria um segundo caminho sem trilha.
        """
        self.client.patch(
            reverse('usuario-detail', args=[self.supervisor.pk]),
            {'situacao': SituacaoConta.SUSPENSO},
            format='json',
        )

        self.supervisor.refresh_from_db()
        self.assertEqual(self.supervisor.situacao, SituacaoConta.ATIVO)


class ReenvioDeConviteTests(BaseContas):
    def setUp(self):
        super().setUp()
        self.convidado = Usuario.objects.create_user(
            email='rafael.antunes@ac2microbiologia.com.br',
            nome='Rafael Antunes',
            papel=Papel.SUPERVISOR,
        )

    def test_reenvio_emite_novo_token_e_invalida_o_anterior(self):
        antigo = TokenAcesso.emitir(self.convidado, FinalidadeToken.CONVITE)

        resposta = self.client.post(
            reverse('usuario-reenviar-convite', args=[self.convidado.pk])
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        antigo.refresh_from_db()
        self.assertFalse(antigo.valido)
        self.assertEqual(len(mail.outbox), 1)

    def test_nao_reenvia_para_conta_que_ja_definiu_senha(self):
        self.convidado.set_password(SENHA)
        self.convidado.save(update_fields=['password'])

        resposta = self.client.post(
            reverse('usuario-reenviar-convite', args=[self.convidado.pk])
        )

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(len(mail.outbox), 0)


class ListagemTests(BaseContas):
    def setUp(self):
        super().setUp()
        Usuario.objects.create_user(
            email='rafael@ac2microbiologia.com.br', nome='Rafael Antunes',
            papel=Papel.SUPERVISOR,
        )
        Usuario.objects.create_user(
            email='maria@ac2microbiologia.com.br', nome='Maria Ferreira',
            papel=Papel.PESQUISADOR, password=SENHA,
        )

    def test_lista_todos_os_papeis(self):
        """Nao criar Pesquisador por aqui nao significa nao enxerga-lo."""
        resposta = self.client.get(reverse('usuario-list'))

        papeis = {linha['papel'] for linha in resposta.data['results']}
        self.assertIn(Papel.PESQUISADOR, papeis)
        self.assertIn(Papel.SUPERVISOR, papeis)
        self.assertIn(Papel.ADMINISTRADOR, papeis)

    def test_filtra_por_papel(self):
        resposta = self.client.get(
            reverse('usuario-list'), {'papel': Papel.SUPERVISOR}
        )

        papeis = {linha['papel'] for linha in resposta.data['results']}
        self.assertEqual(papeis, {Papel.SUPERVISOR})

    def test_busca_por_nome_ou_email(self):
        resposta = self.client.get(reverse('usuario-list'), {'busca': 'maria'})

        emails = {linha['email'] for linha in resposta.data['results']}
        self.assertEqual(emails, {'maria@ac2microbiologia.com.br'})

    def test_traz_o_rotulo_e_a_instituicao_que_a_tela_mostra(self):
        resposta = self.client.get(reverse('usuario-list'))

        linha = resposta.data['results'][0]
        for campo in ('nome', 'email', 'papel', 'papel_rotulo', 'situacao',
                      'situacao_rotulo', 'instituicao', 'ultimo_acesso'):
            self.assertIn(campo, linha)
