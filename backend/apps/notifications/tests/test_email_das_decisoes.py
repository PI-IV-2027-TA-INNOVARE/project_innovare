"""
Testes do aviso por e-mail ao Demandante (PB26 / P17).

O que esta sob prova: Revisar, Continuar e Arquivar saem por e-mail para as
contas ativas da empresa demandante, uma mensagem por conta, sem nada interno
no texto. O backend de e-mail da suite e `locmem`: nada sai daqui (AGENTS.md
0.1).
"""
import smtplib
from unittest import mock

from django.core import mail
from django.test import TestCase, override_settings

from apps.decisions.models import Decisao, TipoDecisao
from apps.notifications.models import Notificacao
from apps.opportunities.models import Oportunidade, PrioridadeOportunidade, SituacaoOportunidade
from apps.opportunities.services import RegistrarDecisaoService
from core.exceptions import ConflitoDeEstado
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
    indicar_na_equipe,
)

JUSTIFICATIVA = 'Faltam os laudos microbiologicos dos lotes afetados.'


@override_settings(SEND_NOTIFICATION_EMAILS=True)
class EmailDasDecisoesTests(TestCase):
    def setUp(self):
        self.empresa = OrganizacaoBuilder().demandante().chamada('Vale Verde').build()
        self.contato = (
            UsuarioBuilder().demandante().chamado('Ana Souza').na_organizacao(self.empresa).build()
        )
        self.segundo_contato = UsuarioBuilder().demandante().na_organizacao(self.empresa).build()
        self.contato_inativo = (
            UsuarioBuilder().demandante().na_organizacao(self.empresa).inativo().build()
        )
        self.outra_empresa = (
            UsuarioBuilder()
            .demandante()
            .na_organizacao(OrganizacaoBuilder().demandante().build())
            .build()
        )
        self.supervisor = UsuarioBuilder().supervisor().chamado('Rafael Antunes').build()

        self.oportunidade = (
            OportunidadeBuilder()
            .externa(self.empresa)
            .intitulada('Contaminacao na linha de envase')
            .aguardando_decisao()
            .build()
        )
        Oportunidade.objects.filter(pk=self.oportunidade.pk).update(
            prioridade=PrioridadeOportunidade.ALTA
        )
        indicar_na_equipe(
            self.oportunidade, MembroRedeBuilder().pesquisador().chamado('Marina Alves').build()
        )

    def decidir(self, tipo, oportunidade=None):
        with self.captureOnCommitCallbacks(execute=True):
            RegistrarDecisaoService().execute(
                oportunidade=oportunidade or self.oportunidade,
                tipo=tipo,
                justificativa=JUSTIFICATIVA,
                ator=self.supervisor,
            )

    def test_as_tres_decisoes_saem_por_email(self):
        """SPEC-12: Revisar, Continuar e Arquivar geram e-mail."""
        for tipo in (TipoDecisao.REVISAR, TipoDecisao.CONTINUAR, TipoDecisao.ARQUIVAR):
            mail.outbox = []
            oportunidade = OportunidadeBuilder().externa(self.empresa).aguardando_decisao().build()

            self.decidir(tipo, oportunidade)

            self.assertEqual(len(mail.outbox), 2, tipo)
            self.assertTrue(all(oportunidade.codigo in email.subject for email in mail.outbox))

    def test_vai_para_as_contas_ativas_da_empresa_uma_por_mensagem(self):
        self.decidir(TipoDecisao.CONTINUAR)

        destinatarios = [email.to for email in mail.outbox]
        self.assertCountEqual(
            destinatarios, [[self.contato.email], [self.segundo_contato.email]]
        )

    def test_revisar_leva_o_pedido_de_complementacao(self):
        self.decidir(TipoDecisao.REVISAR)

        corpo = mail.outbox[0].body
        self.assertIn(JUSTIFICATIVA, corpo)
        self.assertIn(f'/problemas/{self.oportunidade.codigo}', corpo)

    def test_continuar_e_arquivar_nao_levam_a_justificativa(self):
        """PB71: nas duas, a justificativa e raciocinio interno."""
        self.decidir(TipoDecisao.CONTINUAR)

        self.assertNotIn(JUSTIFICATIVA, mail.outbox[0].body)

    def test_email_nao_leva_informacao_interna(self):
        """SPEC-12: nem equipe, nem prioridade, nem quem decidiu."""
        self.decidir(TipoDecisao.REVISAR)

        texto = mail.outbox[0].subject + mail.outbox[0].body
        for interno in ('Marina Alves', 'Rafael Antunes', self.supervisor.email, 'Alta', 'prioridade'):
            self.assertNotIn(interno, texto)

    def test_ideia_interna_nao_gera_email(self):
        interna = OportunidadeBuilder().interna().aguardando_decisao().build()

        self.decidir(TipoDecisao.CONTINUAR, interna)

        self.assertEqual(mail.outbox, [])

    @override_settings(SEND_NOTIFICATION_EMAILS=False)
    def test_chave_desligada_nao_envia(self):
        self.decidir(TipoDecisao.REVISAR)

        self.assertEqual(mail.outbox, [])
        self.assertTrue(Notificacao.objects.filter(usuario=self.contato).exists())

    def test_falha_do_servidor_de_email_nao_desfaz_a_decisao(self):
        with mock.patch(
            'apps.notifications.services.email.send_mass_mail',
            side_effect=smtplib.SMTPException('recusado'),
        ):
            self.decidir(TipoDecisao.ARQUIVAR)

        self.oportunidade.refresh_from_db()
        self.assertEqual(self.oportunidade.situacao, SituacaoOportunidade.ARQUIVADA)
        self.assertEqual(Decisao.objects.count(), 1)

    def test_falha_de_envio_fica_no_log_sem_o_endereco(self):
        with mock.patch(
            'apps.notifications.services.email.send_mass_mail',
            side_effect=smtplib.SMTPException('recusado'),
        ), self.assertLogs('apps.notifications.services.email', level='WARNING') as log:
            self.decidir(TipoDecisao.REVISAR)

        registro = ' '.join(log.output)
        self.assertIn(self.oportunidade.codigo, registro)
        self.assertNotIn(self.contato.email, registro)
        self.assertNotIn('Ana Souza', registro)

    def test_decisao_recusada_nao_envia_nada(self):
        entrada = OportunidadeBuilder().externa(self.empresa).build()

        with self.assertRaises(ConflitoDeEstado):
            self.decidir(TipoDecisao.CONTINUAR, entrada)

        self.assertEqual(mail.outbox, [])
