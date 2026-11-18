"""
O seed de volume: o banco local com gente e oportunidades o bastante para
conferir as telas com cara de uso real.

Matching e pre-analise entram como resultado gravado, como se a IA tivesse
rodado: nenhuma chamada a provedor, nenhum e-mail. A situacao de cada
oportunidade e a que os dados dela dizem, pela mesma regra da conferencia do
fluxo.
"""
from datetime import timedelta
from io import StringIO
from unittest import mock

from django.conf import settings
from django.core import mail
from django.core.management import CommandError, call_command
from django.db.models import Max, Min
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Papel, Usuario
from apps.ai.models import ExecucaoIA
from apps.audit.models import EventoAuditoria
from apps.dashboard.services.indicadores_ia import indicadores_de_ia
from apps.decisions.models import Decisao, TipoDecisao
from apps.network.models import Disponibilidade, MembroRede, PapelNaRede, SituacaoMembro
from apps.opportunities.models import Oportunidade, SituacaoOportunidade
from apps.opportunities.services.fluxo import ETAPAS_EM_CURSO, situacao_pelos_dados

DOMINIO_FICTICIO = '.example'
OPORTUNIDADES = 18

SITUACAO_DA_DECISAO = {
    TipoDecisao.CONTINUAR: SituacaoOportunidade.CONTINUAR,
    TipoDecisao.REVISAR: SituacaoOportunidade.REVISAR,
    TipoDecisao.ARQUIVAR: SituacaoOportunidade.ARQUIVADA,
}


def semear(*args):
    call_command(
        'semear_volume_dev', '--oportunidades', str(OPORTUNIDADES), *args, stdout=StringIO()
    )


class SemearVolumeDevTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        with mock.patch('apps.notifications.services.email.send_mass_mail') as envio:
            semear()
        cls.envio = envio

    def test_cria_o_volume_pedido_de_oportunidades(self):
        self.assertEqual(Oportunidade.objects.count(), OPORTUNIDADES)

    def test_toda_etapa_do_fluxo_tem_oportunidade(self):
        situacoes = set(Oportunidade.objects.values_list('situacao', flat=True))

        self.assertEqual(situacoes, set(SituacaoOportunidade.values))

    def test_a_situacao_de_cada_oportunidade_e_a_que_os_dados_dizem(self):
        for oportunidade in Oportunidade.objects.all():
            if oportunidade.situacao in ETAPAS_EM_CURSO:
                self.assertEqual(
                    situacao_pelos_dados(oportunidade), oportunidade.situacao, oportunidade.titulo
                )
                self.assertFalse(oportunidade.decisoes.exists(), oportunidade.titulo)
            else:
                decisao = oportunidade.decisoes.order_by('-registrada_em').first()

                self.assertIsNotNone(decisao, oportunidade.titulo)
                self.assertEqual(
                    SITUACAO_DA_DECISAO[decisao.tipo_decisao], oportunidade.situacao
                )

    def test_a_rede_tem_volume_e_variedade(self):
        rede = MembroRede.objects.all()

        self.assertGreaterEqual(rede.count(), 50)
        self.assertGreaterEqual(rede.filter(papel_rede=PapelNaRede.SUPERVISOR).count(), 5)
        self.assertEqual(
            set(rede.values_list('disponibilidade', flat=True)), set(Disponibilidade.values)
        )
        self.assertTrue(rede.filter(situacao=SituacaoMembro.INATIVO).exists())
        self.assertGreaterEqual(rede.values('titulacao').distinct().count(), 4)

    def test_os_indicadores_de_matching_e_maturidade_ficam_povoados(self):
        supervisor = Usuario.objects.filter(
            papel=Papel.SUPERVISOR, email__endswith=DOMINIO_FICTICIO
        ).first()
        ia = indicadores_de_ia(supervisor)
        matching, maturidade = ia['matching'], ia['maturidade']
        frageis = sum(item['total'] for item in maturidade['frageis_por_dimensao'])

        self.assertTrue(matching['houve_rodada'])
        self.assertGreater(matching['competencias_com_lacuna'], 0)
        self.assertGreater(matching['competencias_cobertas'], 0)
        self.assertGreater(matching['indicacoes_validadas'], 0)
        self.assertGreater(matching['indicacoes_manuais'], 0)
        self.assertIsNotNone(matching['score_medio'])
        self.assertTrue(maturidade['houve_execucao'])
        self.assertGreater(frageis, 0)
        self.assertGreater(maturidade['recomendacoes_acatadas'], 0)
        self.assertGreater(maturidade['lacunas_abertas'], 0)

    def test_as_pessoas_semeadas_sao_ficticias_e_nao_entram_na_plataforma(self):
        contas = Usuario.objects.all()

        self.assertTrue(contas.exists())

        for conta in contas:
            self.assertTrue(conta.email.endswith(DOMINIO_FICTICIO), conta.email)
            self.assertFalse(conta.has_usable_password(), conta.email)

    def test_nao_manda_email_nem_chama_a_ia(self):
        self.assertEqual(mail.outbox, [])
        self.envio.assert_not_called()
        self.assertFalse(ExecucaoIA.objects.exists())

    def test_a_trilha_fica_entre_o_cadastro_e_hoje_na_ordem_em_que_aconteceu(self):
        """
        O seed roda em segundos. Sem levar as datas para a janela da
        oportunidade, a trilha mostrava tudo no mesmo minuto e a decisao meses
        antes dos eventos que levaram a ela.
        """
        agora = timezone.now()

        for oportunidade in Oportunidade.objects.all():
            with self.subTest(oportunidade=oportunidade.codigo):
                momentos = list(
                    EventoAuditoria.objects.filter(oportunidade=oportunidade)
                    .order_by('pk')
                    .values_list('ocorrido_em', flat=True)
                )

                self.assertTrue(momentos)
                self.assertGreaterEqual(momentos[0], oportunidade.criada_em)
                self.assertLessEqual(momentos[-1], agora)
                self.assertEqual(momentos, sorted(momentos))

    def test_a_trilha_da_decidida_se_espalha_por_dias(self):
        for decisao in Decisao.objects.select_related('oportunidade'):
            with self.subTest(oportunidade=decisao.oportunidade.codigo):
                momentos = EventoAuditoria.objects.filter(
                    oportunidade=decisao.oportunidade
                ).aggregate(primeiro=Min('ocorrido_em'), ultimo=Max('ocorrido_em'))

                self.assertGreater(momentos['ultimo'] - momentos['primeiro'], timedelta(days=1))

    def test_a_decisao_entra_na_trilha_como_decisao_na_data_dela(self):
        """Como o servico de decisao grava: o evento e da decisao, e nao so a troca de situacao."""
        for decisao in Decisao.objects.select_related('oportunidade'):
            with self.subTest(oportunidade=decisao.oportunidade.codigo):
                evento = EventoAuditoria.objects.get(
                    oportunidade=decisao.oportunidade,
                    tipo=f'decisao_{decisao.tipo_decisao}',
                )

                self.assertEqual(evento.ocorrido_em.date(), decisao.registrada_em.date())

    def test_a_ultima_atualizacao_e_a_do_ultimo_evento(self):
        for oportunidade in Oportunidade.objects.all():
            with self.subTest(oportunidade=oportunidade.codigo):
                ultimo = EventoAuditoria.objects.filter(oportunidade=oportunidade).aggregate(
                    ultimo=Max('ocorrido_em')
                )['ultimo']

                self.assertEqual(oportunidade.atualizada_em, ultimo)

    def test_rodar_de_novo_nao_duplica(self):
        antes = (
            Oportunidade.objects.count(),
            MembroRede.objects.count(),
            Usuario.objects.count(),
        )

        semear()

        self.assertEqual(
            (Oportunidade.objects.count(), MembroRede.objects.count(), Usuario.objects.count()),
            antes,
        )


class TravasDoSemearVolumeDevTests(TestCase):
    def test_recusa_banco_remoto(self):
        remoto = {**settings.DATABASES['default'], 'HOST': 'ep-x.sa-east-1.aws.neon.tech'}

        with mock.patch.dict(settings.DATABASES, {'default': remoto}):
            with self.assertRaises(CommandError):
                semear()

        self.assertFalse(Oportunidade.objects.exists())

    def test_recusa_menos_oportunidades_que_etapas(self):
        with self.assertRaises(CommandError):
            call_command('semear_volume_dev', '--oportunidades', '5', stdout=StringIO())
