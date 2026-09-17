"""
Testes da porta de e-mail e dos seus adaptadores.

O que estes casos protegem e a costura: o caso de uso fala com
`EnviadorDeEmail`, nunca com `django.core.mail`. Enquanto isso valer, trocar o
transporte - por um duble no teste, por outro provedor amanha - nao toca regra
de negocio nenhuma (AGENTS.md 0.1).
"""
from django.core import mail
from django.test import TestCase

from apps.accounts.models import FinalidadeToken, TokenAcesso
from apps.accounts.services.acesso import SolicitarRecuperacaoSenhaService
from apps.accounts.services.contas import ProvisionarContaService
from apps.accounts.services.email import (
    EnviadorDeEmail,
    EnviadorDjango,
    EnviadorEmMemoria,
)
from apps.network.services import LiberarAcessoMembroService
from core.tests.builders import MembroRedeBuilder, UsuarioBuilder


class ContratoDoEnviadorTests(TestCase):
    def test_os_dois_adaptadores_cumprem_o_mesmo_contrato(self):
        self.assertIsInstance(EnviadorDjango(), EnviadorDeEmail)
        self.assertIsInstance(EnviadorEmMemoria(), EnviadorDeEmail)

    def test_o_padrao_e_o_transporte_do_django(self):
        servico = ProvisionarContaService()

        self.assertIsInstance(servico._email, EnviadorDjango)


class DubleNoLugarDoTransporteTests(TestCase):
    def setUp(self):
        self.duble = EnviadorEmMemoria()
        self.administrador = UsuarioBuilder().administrador().build()

    def test_provisionamento_entrega_o_convite_ao_duble(self):
        usuario = ProvisionarContaService(self.duble).execute(
            nome='Rafael Antunes',
            email='rafael@ac2microbiologia.com.br',
            papel='supervisor',
            ator=self.administrador,
        )

        self.assertEqual(len(self.duble.convites), 1)
        self.assertEqual(len(mail.outbox), 0)

        destinatario, token = self.duble.convites[0]

        self.assertEqual(destinatario, usuario)
        self.assertEqual(token.finalidade, FinalidadeToken.CONVITE)

    def test_recuperacao_entrega_o_token_da_conta_certa(self):
        pessoa = UsuarioBuilder().pesquisador().build()

        SolicitarRecuperacaoSenhaService(self.duble).execute(pessoa.email)

        self.assertEqual(len(self.duble.recuperacoes), 1)
        self.assertEqual(len(mail.outbox), 0)

        destinatario, token = self.duble.recuperacoes[0]

        self.assertEqual(destinatario, pessoa)
        self.assertEqual(token.finalidade, FinalidadeToken.RECUPERACAO)

    def test_conta_inexistente_nao_chega_ao_transporte(self):
        SolicitarRecuperacaoSenhaService(self.duble).execute('ninguem@ac2.com.br')

        self.assertEqual(self.duble.recuperacoes, [])
        self.assertEqual(len(mail.outbox), 0)

    def test_liberar_acesso_na_rede_usa_a_mesma_porta(self):
        membro = MembroRedeBuilder().pesquisador().chamado('Maria Ferreira').build()

        LiberarAcessoMembroService(self.duble).execute(
            membro=membro, ator=self.administrador
        )

        self.assertEqual(len(self.duble.convites), 1)
        self.assertEqual(len(mail.outbox), 0)

        destinatario, _ = self.duble.convites[0]

        self.assertEqual(destinatario.email, membro.email)


class TransportePadraoTests(TestCase):
    def test_sem_duble_o_e_mail_sai_pelo_django(self):
        administrador = UsuarioBuilder().administrador().build()

        ProvisionarContaService().execute(
            nome='Rafael Antunes',
            email='rafael@ac2microbiologia.com.br',
            papel='supervisor',
            ator=administrador,
        )

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('rafael@ac2microbiologia.com.br', mail.outbox[0].to)
        self.assertIn(
            TokenAcesso.objects.latest('criado_em').token, mail.outbox[0].body
        )
