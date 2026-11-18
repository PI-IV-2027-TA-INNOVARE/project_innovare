"""
O resumo da Equipe Potencial na fila de oportunidades.

A fila nao recebia nada da equipe, e a tela escrevia "Ainda sem matching" em
toda linha - inclusive nas que ja estavam em Pre-analise ou decididas, que
passaram pelo matching. O card "Com lacuna de competencia" contava zero sempre.

A linha agora traz o estado da equipe, quantas pessoas ela tem e quantas
lacunas, sempre da ultima equipe gerada. A Equipe e trabalho interno: o
Demandante nao recebe o resumo, como nao recebe a aba.
"""
from datetime import timedelta

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.competencies.models import CompetenciaNecessaria, NivelImportancia
from apps.copilot.models import PropostaEstruturada
from apps.matching.models import EquipePotencial, LacunaCompetenciaEquipe, MembroEquipe
from apps.network.models import PapelNaRede
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
)


class EquipeNaFilaBaseTests(TestCase):
    url = reverse('oportunidade-list')

    def setUp(self):
        self.client = APIClient()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.organizacao = OrganizacaoBuilder().demandante().build()
        self.client.force_authenticate(self.supervisor)

        self.oportunidade = (
            OportunidadeBuilder().externa(self.organizacao).intitulada('Soro de leite').build()
        )

    def com_competencias(self, oportunidade, quantidade=2):
        proposta = PropostaEstruturada.objects.create(
            oportunidade=oportunidade, revisada_por_humano=True
        )

        for indice in range(quantidade):
            CompetenciaNecessaria.objects.create(
                proposta=proposta,
                descricao=f'Competencia {indice}',
                nivel_importancia=NivelImportancia.ESSENCIAL,
            )

    def equipe(self, oportunidade, *, pessoas=0, fora=0, lacunas=0):
        equipe = EquipePotencial.objects.create(oportunidade=oportunidade)

        for indice in range(pessoas + fora):
            MembroEquipe.objects.create(
                equipe=equipe,
                membro=MembroRedeBuilder().pesquisador().chamado(f'Pessoa {equipe.pk}-{indice}').build(),
                papel=PapelNaRede.PESQUISADOR,
                incluido=indice < pessoas,
            )

        for indice in range(lacunas):
            LacunaCompetenciaEquipe.objects.create(
                equipe=equipe, descricao=f'Lacuna {indice}'
            )

        return equipe

    def linha(self):
        resultados = self.client.get(self.url, {'page_size': '100'}).data['results']
        return next(item for item in resultados if item['codigo'] == self.oportunidade.codigo)


class EstadoDaEquipeTests(EquipeNaFilaBaseTests):
    def test_sem_competencia_necessaria_o_matching_ainda_nao_pode_rodar(self):
        resumo = self.linha()['resumo_da_equipe']

        self.assertEqual(resumo, {'estado': 'aguardando_competencias', 'membros': 0, 'lacunas': 0})

    def test_com_competencias_e_sem_equipe_o_matching_nao_foi_executado(self):
        self.com_competencias(self.oportunidade)

        self.assertEqual(self.linha()['resumo_da_equipe']['estado'], 'nao_executado')

    def test_matching_que_nao_achou_ninguem_nao_se_confunde_com_nao_executado(self):
        self.com_competencias(self.oportunidade)
        self.equipe(self.oportunidade, pessoas=0, lacunas=2)

        resumo = self.linha()['resumo_da_equipe']

        self.assertEqual(resumo, {'estado': 'sem_resultado', 'membros': 0, 'lacunas': 2})

    def test_conta_so_quem_continua_na_composicao_e_as_lacunas_da_equipe(self):
        """Tirar alguem da composicao nao apaga a indicacao: a fila conta `incluido`."""
        self.com_competencias(self.oportunidade)
        self.equipe(self.oportunidade, pessoas=2, fora=1, lacunas=1)

        resumo = self.linha()['resumo_da_equipe']

        self.assertEqual(resumo, {'estado': 'com_equipe', 'membros': 2, 'lacunas': 1})

    def test_vale_a_ultima_equipe_gerada(self):
        self.com_competencias(self.oportunidade)
        antiga = self.equipe(self.oportunidade, pessoas=3, lacunas=2)
        EquipePotencial.objects.filter(pk=antiga.pk).update(
            data_geracao=timezone.now() - timedelta(days=5)
        )
        self.equipe(self.oportunidade, pessoas=1, lacunas=0)

        resumo = self.linha()['resumo_da_equipe']

        self.assertEqual(resumo, {'estado': 'com_equipe', 'membros': 1, 'lacunas': 0})

    def test_o_detalhe_traz_o_mesmo_resumo(self):
        self.com_competencias(self.oportunidade)
        self.equipe(self.oportunidade, pessoas=2, lacunas=1)

        dados = self.client.get(
            reverse('oportunidade-detail', args=[self.oportunidade.codigo])
        ).data

        self.assertEqual(dados['resumo_da_equipe'], {'estado': 'com_equipe', 'membros': 2, 'lacunas': 1})


class QuemRecebeOResumoTests(EquipeNaFilaBaseTests):
    def test_o_demandante_nao_recebe_o_resumo_da_equipe(self):
        demandante = UsuarioBuilder().demandante().na_organizacao(self.organizacao).build()
        self.com_competencias(self.oportunidade)
        self.equipe(self.oportunidade, pessoas=2, lacunas=1)
        self.client.force_authenticate(demandante)

        self.assertNotIn('resumo_da_equipe', self.linha())

    def test_o_pesquisador_indicado_recebe_o_resumo(self):
        conta = UsuarioBuilder().pesquisador().build()
        self.com_competencias(self.oportunidade)
        equipe = self.equipe(self.oportunidade, pessoas=1)
        MembroEquipe.objects.create(
            equipe=equipe,
            membro=MembroRedeBuilder().pesquisador().com_acesso(conta).build(),
            papel=PapelNaRede.PESQUISADOR,
        )
        self.client.force_authenticate(conta)

        self.assertEqual(self.linha()['resumo_da_equipe']['membros'], 2)


class OrcamentoDoResumoTests(EquipeNaFilaBaseTests):
    def _queries_da_fila(self):
        with CaptureQueriesContext(connection) as capturadas:
            resposta = self.client.get(self.url, {'page_size': '100'})

        self.assertEqual(resposta.status_code, 200)
        return len(capturadas.captured_queries)

    def _povoar(self, quantidade):
        for indice in range(quantidade):
            oportunidade = (
                OportunidadeBuilder().externa(self.organizacao).intitulada(f'Com equipe {indice}').build()
            )
            self.com_competencias(oportunidade, quantidade=1)
            self.equipe(oportunidade, pessoas=2, lacunas=1)

    def test_o_resumo_nao_faz_a_fila_crescer_em_queries(self):
        self._povoar(2)
        com_poucas = self._queries_da_fila()

        self._povoar(8)

        self.assertEqual(self._queries_da_fila(), com_poucas)
