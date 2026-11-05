"""O vocabulario de competencias: sinonimo vira o termo canonico."""
from io import StringIO
from unittest import mock

from django.conf import settings
from django.core.management import CommandError, call_command
from django.test import TestCase

from apps.network.models import Competencia, TipoCompetencia
from apps.network.services.vocabulario import Vocabulario
from core.tests.builders import MembroRedeBuilder


def banco_remoto():
    return {**settings.DATABASES['default'], 'HOST': 'ep-x.sa-east-1.aws.neon.tech'}


class VocabularioTests(TestCase):
    def test_troca_o_sinonimo_pelo_canonico_sem_tocar_em_palavra_parecida(self):
        vocabulario = Vocabulario({'qPCR': 'PCR quantitativo'})

        self.assertEqual(
            vocabulario.canonizar('Domina qPCR e qpcr; não qPCRx.'),
            'Domina PCR quantitativo e PCR quantitativo; não qPCRx.',
        )

    def test_le_os_sinonimos_cadastrados_na_rede(self):
        canonica = Competencia.objects.create(
            nome='PCR quantitativo', tipo=TipoCompetencia.TECNICA, canonica=True
        )
        Competencia.objects.create(
            nome='qPCR', tipo=TipoCompetencia.TECNICA, sinonimo_de=canonica
        )

        self.assertEqual(Vocabulario.da_rede().canonizar('qPCR'), 'PCR quantitativo')


class VocabularioInicialTests(TestCase):
    def test_liga_ao_termo_mais_usado_quem_so_difere_por_acento(self):
        MembroRedeBuilder().pesquisador().com_competencia('Fermentação').build()
        MembroRedeBuilder().pesquisador().com_competencia('Fermentação').build()
        MembroRedeBuilder().pesquisador().com_competencia('fermentacao').build()

        call_command('vocabulario_inicial', stdout=StringIO())

        canonica = Competencia.objects.get(nome='Fermentação')
        sinonimo = Competencia.objects.get(nome='fermentacao')
        self.assertTrue(canonica.canonica)
        self.assertEqual(sinonimo.sinonimo_de, canonica)

    def test_simulacao_so_lista(self):
        MembroRedeBuilder().pesquisador().com_competencia('Fermentação').build()
        MembroRedeBuilder().pesquisador().com_competencia('fermentacao').build()
        saida = StringIO()

        call_command('vocabulario_inicial', '--simular', stdout=saida)

        self.assertIn('Grupos de sinônimos: 1', saida.getvalue())
        self.assertIsNone(Competencia.objects.get(nome='fermentacao').sinonimo_de)

    def test_recusa_banco_remoto_sem_pedido_explicito(self):
        MembroRedeBuilder().pesquisador().com_competencia('Fermentação').build()
        MembroRedeBuilder().pesquisador().com_competencia('fermentacao').build()

        with mock.patch.dict(settings.DATABASES, {'default': banco_remoto()}):
            with self.assertRaises(CommandError):
                call_command('vocabulario_inicial', stdout=StringIO())

        self.assertIsNone(Competencia.objects.get(nome='fermentacao').sinonimo_de)

    def test_banco_remoto_so_com_a_opcao(self):
        """Como no `gerar_vetores`: a pedido explicito, depois do backup."""
        MembroRedeBuilder().pesquisador().com_competencia('Fermentação').build()
        MembroRedeBuilder().pesquisador().com_competencia('fermentacao').build()

        with mock.patch.dict(settings.DATABASES, {'default': banco_remoto()}):
            call_command('vocabulario_inicial', '--banco-remoto', stdout=StringIO())

        sinonimo = Competencia.objects.get(nome='fermentacao')
        self.assertEqual(sinonimo.sinonimo_de.nome, 'Fermentação')
