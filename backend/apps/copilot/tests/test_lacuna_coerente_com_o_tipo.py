"""
A mesma tabela guarda a lacuna do Copiloto e a da pre-analise.

A natureza (ausente, inconsistente, pouco desenvolvido) e da lacuna que o
Copiloto aponta na proposta. O criterio (A1 a F3) e da lacuna da pre-analise.
O banco recusa a combinacao trocada, venha ela da aplicacao, do admin ou de um
script de carga.

Nada toca banco remoto (AGENTS.md 0.1).
"""
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.copilot.models import Lacuna, NaturezaLacuna, PropostaEstruturada, TipoLacuna
from apps.maturity.models import CriterioPreAnalise, VersaoCriterio
from core.tests.builders import OportunidadeBuilder


class LacunaCoerenteComOTipoTests(TestCase):
    def setUp(self):
        self.proposta = PropostaEstruturada.objects.create(
            oportunidade=OportunidadeBuilder().interna().build()
        )
        self.criterio = CriterioPreAnalise.objects.create(
            versao_criterio=VersaoCriterio.objects.create(
                versao='V1', vigente_de=timezone.localdate()
            ),
            dimensao='plano_pesquisa',
            codigo='A3',
            descricao='Metodologia adequada.',
        )

    def lacuna(self, **campos):
        return Lacuna.objects.create(
            proposta=self.proposta, descricao='Falta a metodologia.', **campos
        )

    def test_lacuna_do_copiloto_guarda_a_natureza(self):
        lacuna = self.lacuna(tipo=TipoLacuna.PROPOSTA, natureza=NaturezaLacuna.AUSENTE)

        self.assertIsNotNone(lacuna.pk)

    def test_lacuna_da_pre_analise_guarda_o_criterio(self):
        lacuna = self.lacuna(tipo=TipoLacuna.PRE_ANALISE, criterio=self.criterio)

        self.assertIsNotNone(lacuna.pk)

    def test_banco_recusa_natureza_na_lacuna_da_pre_analise(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.lacuna(tipo=TipoLacuna.PRE_ANALISE, natureza=NaturezaLacuna.AUSENTE)

    def test_banco_recusa_criterio_na_lacuna_do_copiloto(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.lacuna(tipo=TipoLacuna.PROPOSTA, criterio=self.criterio)
