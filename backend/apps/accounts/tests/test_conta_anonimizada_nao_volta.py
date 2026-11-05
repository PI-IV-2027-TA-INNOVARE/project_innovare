"""
Conta anonimizada a pedido da pessoa nao volta a ser usada (LGPD).

Reativada, editada ou convidada de novo, ela passaria a outra pessoa com o
historico de quem pediu para sair. Todas as portas recusam: a da rede, a do
Administrador e o aviso por e-mail.
"""
from django.test import TestCase

from apps.accounts.models import SituacaoConta, Usuario
from apps.accounts.services.contas import (
    AlterarSituacaoContaService,
    AtualizarContaService,
    ReenviarConviteService,
)
from apps.accounts.services.email import EnviadorEmMemoria
from apps.accounts.services.titular import AnonimizarContaService
from apps.notifications.services.email import contas_avisadas
from core.exceptions import ConflitoDeEstado
from core.tests.builders import OrganizacaoBuilder, UsuarioBuilder


class ContaAnonimizadaNaoVoltaTests(TestCase):
    def setUp(self):
        self.administrador = UsuarioBuilder().administrador().build()
        self.empresa = OrganizacaoBuilder().demandante().build()
        self.conta = (
            UsuarioBuilder().demandante().na_organizacao(self.empresa).sem_senha_utilizavel().build()
        )
        AnonimizarContaService().execute(usuario=self.conta, ator=self.administrador)
        self.conta.refresh_from_db()

    def recusa(self, acao):
        with self.assertRaises(ConflitoDeEstado) as erro:
            acao()

        self.assertEqual(erro.exception.codigo, 'conta_anonimizada')

    def test_nao_volta_a_ficar_ativa(self):
        self.recusa(
            lambda: AlterarSituacaoContaService().execute(
                usuario=self.conta, situacao=SituacaoConta.ATIVO, ator=self.administrador
            )
        )

    def test_nao_recebe_outro_e_mail(self):
        self.recusa(
            lambda: AtualizarContaService().execute(
                usuario=self.conta,
                dados={'email': 'nova.pessoa@valeverde.com.br'},
                ator=self.administrador,
            )
        )
        self.conta.refresh_from_db()
        self.assertTrue(self.conta.email.endswith('@anonimizado.invalid'))

    def test_nao_recebe_convite(self):
        enviador = EnviadorEmMemoria()

        self.recusa(
            lambda: ReenviarConviteService(enviador=enviador).execute(
                usuario=self.conta, ator=self.administrador
            )
        )
        self.assertEqual(enviador.convites, [])

    def test_nao_entra_no_aviso_por_e_mail_nem_se_a_situacao_mudar_por_fora(self):
        Usuario.objects.filter(pk=self.conta.pk).update(situacao=SituacaoConta.ATIVO)

        self.assertNotIn(self.conta, list(contas_avisadas(self.empresa.pk)))
