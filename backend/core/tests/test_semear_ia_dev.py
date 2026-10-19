"""
O seed que deixa o banco local pronto para exercitar a IA.

Ele prepara as entradas - rede variada, oportunidades em etapas diferentes,
criterios PIPE - e para ai: quem dispara Copiloto, matching e pre-analise e a
pessoa, pela tela. Por isso nenhuma `ExecucaoIA` nasce do seed.
"""
from io import StringIO
from unittest import mock

from django.conf import settings
from django.core import mail
from django.core.management import CommandError, call_command
from django.test import TestCase

from apps.accounts.models import Papel, Usuario
from apps.ai.models import ExecucaoIA
from apps.competencies.models import CompetenciaNecessaria
from apps.copilot.models import PropostaEstruturada
from apps.maturity.models import CriterioPreAnalise
from apps.network.models import Disponibilidade, MembroRede, SituacaoMembro
from apps.opportunities.models import Oportunidade, OrigemOportunidade

DOMINIO_FICTICIO = '.example'


def semear():
    call_command('semear_ia_dev', stdout=StringIO())


class SemearIaDevTests(TestCase):
    def test_recusa_banco_remoto(self):
        remoto = {**settings.DATABASES['default'], 'HOST': 'ep-x.us-east-2.aws.neon.tech'}

        with mock.patch.dict(settings.DATABASES, {'default': remoto}):
            with self.assertRaises(CommandError):
                semear()

        self.assertFalse(MembroRede.objects.exists())

    def test_monta_uma_rede_variada_para_o_ranking_ter_o_que_ordenar(self):
        semear()

        rede = MembroRede.objects.filter(email__endswith=DOMINIO_FICTICIO)

        self.assertGreaterEqual(rede.count(), 15)
        self.assertTrue(rede.filter(situacao=SituacaoMembro.INATIVO).exists())
        self.assertTrue(rede.filter(disponibilidade=Disponibilidade.INDISPONIVEL).exists())
        self.assertGreaterEqual(rede.values('titulacao').distinct().count(), 3)
        self.assertFalse(rede.filter(vinculos_competencia__isnull=True).exists())

    def test_cada_etapa_da_ia_tem_uma_oportunidade_pronta(self):
        semear()

        semeadas = Oportunidade.objects.filter(criado_por__email__endswith=DOMINIO_FICTICIO)
        sem_proposta = semeadas.filter(proposta__isnull=True)
        com_proposta = semeadas.filter(proposta__isnull=False)
        com_competencias = com_proposta.filter(
            proposta__competencias_necessarias__isnull=False
        ).distinct()

        self.assertGreaterEqual(sem_proposta.count(), 2)
        self.assertGreaterEqual(com_proposta.exclude(pk__in=com_competencias).count(), 2)
        self.assertGreaterEqual(com_competencias.count(), 2)
        self.assertTrue(semeadas.filter(origem=OrigemOportunidade.EXTERNO).exists())
        self.assertTrue(semeadas.filter(origem=OrigemOportunidade.INTERNA).exists())

    def test_ha_proposta_incompleta_para_a_pre_analise_apontar_lacuna(self):
        semear()

        incompletas = PropostaEstruturada.objects.filter(
            oportunidade__criado_por__email__endswith=DOMINIO_FICTICIO,
            metodologia='',
        ).exclude(problema_pesquisa='')

        self.assertTrue(incompletas.exists())

    def test_importa_os_criterios_da_pre_analise(self):
        semear()

        self.assertTrue(CriterioPreAnalise.objects.exists())

    def test_rodar_de_novo_nao_duplica(self):
        semear()
        contagem = (
            MembroRede.objects.count(),
            Oportunidade.objects.count(),
            CompetenciaNecessaria.objects.count(),
            CriterioPreAnalise.objects.count(),
        )

        semear()

        self.assertEqual(
            contagem,
            (
                MembroRede.objects.count(),
                Oportunidade.objects.count(),
                CompetenciaNecessaria.objects.count(),
                CriterioPreAnalise.objects.count(),
            ),
        )

    def test_nao_manda_email_nem_chama_a_ia(self):
        semear()

        self.assertEqual(mail.outbox, [])
        self.assertFalse(ExecucaoIA.objects.exists())

    def test_nao_toca_conta_que_ja_existe(self):
        """
        O `semear_dev` redefine a senha de contas conhecidas. Este seed nao:
        os atores dele sao ficticios, e conta real fica como estava.
        """
        real = Usuario.objects.create_user(
            email='supervisor@ac2.com.br', nome='Pessoa real',
            papel=Papel.SUPERVISOR, password='SenhaDaEquipe!2026',
        )

        semear()

        real.refresh_from_db()
        self.assertTrue(real.check_password('SenhaDaEquipe!2026'))
        self.assertEqual(real.nome, 'Pessoa real')
        self.assertFalse(
            Usuario.objects.exclude(pk=real.pk)
            .exclude(email__endswith=DOMINIO_FICTICIO)
            .exists()
        )

    def test_atores_ficticios_nao_entram_na_plataforma(self):
        semear()

        for conta in Usuario.objects.filter(email__endswith=DOMINIO_FICTICIO):
            self.assertFalse(conta.has_usable_password())
