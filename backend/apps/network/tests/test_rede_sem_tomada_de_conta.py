"""
O Supervisor gere a rede de Pesquisadores, nao as contas de outros perfis.

Trocar o e-mail de login de um Supervisor ou Administrador e pedir a
recuperacao de senha seria tomar a conta dele. Inativar e reativar alcancam so
Pesquisadores, nao desfazem a suspensao do Administrador e nao trazem de volta
cadastro anonimizado. A inativacao corta o acesso e a renovacao.
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import FinalidadeToken, Papel, SituacaoConta, TokenAcesso
from apps.accounts.services.contas import AlterarSituacaoContaService, AtualizarContaService
from core.tests.builders import SENHA_PADRAO, MembroRedeBuilder, UsuarioBuilder

NOVA_SENHA = 'Outra-Senha-Forte-2026!'


class RedeBaseTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.administrador = UsuarioBuilder().administrador().build()
        self.supervisor = UsuarioBuilder().supervisor().build()

    def como(self, usuario):
        self.api.force_authenticate(user=usuario)

    def inativar(self, membro):
        return self.api.post(reverse('membro-rede-inativar', args=[membro.pk]))

    def reativar(self, membro):
        return self.api.post(reverse('membro-rede-reativar', args=[membro.pk]))

    def trocar_email(self, membro, email):
        return self.api.patch(
            reverse('membro-rede-detail', args=[membro.pk]), {'email': email}, format='json'
        )

    def recuperar_e_entrar(self, email):
        anonimo = APIClient()
        anonimo.post(reverse('auth-forgot-password'), {'email': email}, format='json')
        token = TokenAcesso.objects.filter(
            usuario__email=email,
            finalidade=FinalidadeToken.RECUPERACAO,
            usado_em__isnull=True,
        ).order_by('-pk').first()

        if token is None:
            return None

        anonimo.post(
            reverse('auth-reset-password'),
            {'token': token.token, 'nova_senha': NOVA_SENHA, 'confirmar_senha': NOVA_SENHA},
            format='json',
        )
        return anonimo.post(
            reverse('auth-token'), {'email': email, 'password': NOVA_SENHA}, format='json'
        )

    def supervisor_promovido_a_administrador(self):
        promovido = UsuarioBuilder().supervisor().build()
        membro = MembroRedeBuilder().supervisor().com_acesso(promovido).build()
        AtualizarContaService().execute(
            usuario=promovido, dados={'papel': Papel.ADMINISTRADOR}, ator=self.administrador
        )
        return promovido, membro


class TomadaDeContaPeloEmailTests(RedeBaseTests):
    def test_supervisor_nao_troca_o_email_da_conta_de_um_administrador(self):
        _, membro = self.supervisor_promovido_a_administrador()
        self.como(self.supervisor)

        resposta = self.trocar_email(membro, 'atacante@exemplo.com')

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIsNone(self.recuperar_e_entrar('atacante@exemplo.com'))

    def test_supervisor_nao_troca_o_email_da_conta_de_outro_supervisor(self):
        colega = UsuarioBuilder().supervisor().build()
        membro = MembroRedeBuilder().supervisor().com_acesso(colega).build()
        self.como(self.supervisor)

        self.assertEqual(
            self.trocar_email(membro, 'atacante@exemplo.com').status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_email_novo_de_pesquisador_encerra_convites_do_endereco_antigo(self):
        membro = MembroRedeBuilder().pesquisador().com_acesso().build()
        TokenAcesso.emitir(membro.usuario, FinalidadeToken.CONVITE)
        self.como(self.supervisor)

        resposta = self.trocar_email(membro, 'novo.endereco@ac2microbiologia.com.br')

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertFalse(TokenAcesso.objects.filter(usuario=membro.usuario).exists())


class InativarSoPesquisadorTests(RedeBaseTests):
    def test_supervisor_nao_tira_o_login_de_um_administrador(self):
        promovido, membro = self.supervisor_promovido_a_administrador()
        self.como(self.supervisor)

        self.assertEqual(self.inativar(membro).status_code, status.HTTP_403_FORBIDDEN)
        promovido.refresh_from_db()
        self.assertEqual(promovido.situacao, SituacaoConta.ATIVO)

    def test_supervisor_nao_tira_o_login_de_outro_supervisor(self):
        colega = UsuarioBuilder().supervisor().build()
        membro = MembroRedeBuilder().supervisor().com_acesso(colega).build()
        self.como(self.supervisor)

        self.assertEqual(self.inativar(membro).status_code, status.HTTP_403_FORBIDDEN)
        colega.refresh_from_db()
        self.assertEqual(colega.situacao, SituacaoConta.ATIVO)

    def test_reativar_nao_desfaz_a_suspensao_do_administrador(self):
        membro = MembroRedeBuilder().pesquisador().com_acesso().build()
        AlterarSituacaoContaService().execute(
            usuario=membro.usuario, situacao=SituacaoConta.SUSPENSO, ator=self.administrador
        )
        self.como(self.supervisor)

        self.inativar(membro)
        self.reativar(membro)

        membro.usuario.refresh_from_db()
        self.assertEqual(membro.usuario.situacao, SituacaoConta.SUSPENSO)


class CadastroAnonimizadoTests(RedeBaseTests):
    def setUp(self):
        super().setUp()
        self.membro = MembroRedeBuilder().pesquisador().com_acesso().build()
        self.como(self.administrador)
        self.api.post(reverse('usuario-anonimizar', args=[self.membro.usuario.pk]))
        self.como(self.supervisor)

    def test_nao_troca_o_email_nem_volta(self):
        troca = self.trocar_email(self.membro, 'novo.dono@exemplo.com')
        resposta = self.reativar(self.membro)

        self.assertEqual(troca.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertIsNone(self.recuperar_e_entrar('novo.dono@exemplo.com'))


class SessaoDepoisDeInativarTests(RedeBaseTests):
    def entrar(self, membro):
        navegador = APIClient()
        entrada = navegador.post(
            reverse('auth-token'),
            {'email': membro.usuario.email, 'password': SENHA_PADRAO},
            format='json',
        )
        self.assertEqual(entrada.status_code, status.HTTP_200_OK)
        return navegador, entrada.data['access']

    def test_acesso_e_renovacao_param_de_valer(self):
        membro = MembroRedeBuilder().pesquisador().com_acesso().build()
        navegador, acesso = self.entrar(membro)
        self.como(self.supervisor)

        self.assertEqual(self.inativar(membro).status_code, status.HTTP_200_OK)

        navegador.credentials(HTTP_AUTHORIZATION=f'Bearer {acesso}')
        self.assertEqual(
            navegador.get(reverse('auth-profile')).status_code, status.HTTP_401_UNAUTHORIZED
        )
        navegador.credentials()
        self.assertEqual(
            navegador.post(reverse('auth-token-refresh'), {}, format='json').status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_reativar_nao_ressuscita_a_sessao_antiga(self):
        membro = MembroRedeBuilder().pesquisador().com_acesso().build()
        navegador, _ = self.entrar(membro)
        self.como(self.supervisor)

        self.inativar(membro)
        self.reativar(membro)

        self.assertEqual(
            navegador.post(reverse('auth-token-refresh'), {}, format='json').status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
