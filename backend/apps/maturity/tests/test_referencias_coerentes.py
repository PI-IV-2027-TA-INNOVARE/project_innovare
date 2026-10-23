"""
Quem aponta para a oportunidade e para a pre-analise aponta para a mesma.

Lacuna, recomendacao e decisao guardam `id_oportunidade` e `id_pre_analise`.
A primeira e obrigatoria porque a lacuna do Copiloto nasce sem pre-analise; a
segunda ja leva a oportunidade, pela proposta. Duas estradas para o mesmo
lugar so sao seguras se nao puderem levar a lugares diferentes - e o Postgres
nao compara colunas de tabelas diferentes num CHECK.
"""
from django.test import TestCase

from apps.copilot.models import Lacuna, PropostaEstruturada, TipoLacuna
from apps.decisions.models import Decisao, TipoDecisao
from apps.maturity.models import OrigemRecomendacao, PreAnalise, Recomendacao
from core.exceptions import ErroDeDominio
from core.tests.builders import OportunidadeBuilder, UsuarioBuilder, versao_criterio


class ReferenciasCoerentesTests(TestCase):
    def setUp(self):
        self.oportunidade = OportunidadeBuilder().build()
        self.outra = OportunidadeBuilder().build()
        self.proposta = PropostaEstruturada.objects.create(
            oportunidade=self.oportunidade
        )
        self.outra_proposta = PropostaEstruturada.objects.create(
            oportunidade=self.outra
        )
        self.analise = PreAnalise.objects.create(
            proposta=self.proposta,
            versao_criterio=versao_criterio('V1'),
            versao_proposta=1,
        )
        self.supervisor = UsuarioBuilder().supervisor().build()

    def assertDivergente(self, criar):
        with self.assertRaises(ErroDeDominio) as capturado:
            criar()

        self.assertEqual(capturado.exception.codigo, 'referencias_divergentes')

    def test_recomendacao_de_outra_oportunidade_e_recusada(self):
        self.assertDivergente(lambda: Recomendacao.objects.create(
            oportunidade=self.outra,
            origem=OrigemRecomendacao.PRE_ANALISE,
            pre_analise=self.analise,
            texto='Detalhar a metodologia.',
        ))

    def test_lacuna_de_outra_proposta_e_recusada(self):
        self.assertDivergente(lambda: Lacuna.objects.create(
            proposta=self.outra_proposta,
            tipo=TipoLacuna.PRE_ANALISE,
            descricao='Falta o mercado-alvo.',
            pre_analise=self.analise,
        ))

    def test_decisao_de_outra_oportunidade_e_recusada(self):
        self.assertDivergente(lambda: Decisao.objects.create(
            oportunidade=self.outra,
            tipo_decisao=TipoDecisao.CONTINUAR,
            observacoes='Maturidade suficiente.',
            responsavel=self.supervisor,
            pre_analise=self.analise,
        ))

    def test_referencias_da_mesma_oportunidade_gravam(self):
        recomendacao = Recomendacao.objects.create(
            oportunidade=self.oportunidade,
            origem=OrigemRecomendacao.PRE_ANALISE,
            pre_analise=self.analise,
            texto='Detalhar a metodologia.',
        )

        self.assertIsNotNone(recomendacao.pk)

    def test_sem_pre_analise_nao_ha_o_que_conferir(self):
        """A lacuna do Copiloto nasce so com a proposta."""
        lacuna = Lacuna.objects.create(
            proposta=self.outra_proposta,
            tipo=TipoLacuna.PROPOSTA,
            descricao='A proposta nao descreve a hipotese.',
        )

        self.assertIsNotNone(lacuna.pk)
