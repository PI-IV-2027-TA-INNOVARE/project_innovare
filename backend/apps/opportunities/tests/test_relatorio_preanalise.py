"""
Testes do Relatorio da Pre-analise (PB78).

PB78 e *Should Have*, **MVP Sim**, e pede "documento consolidado com resultados
por dimensao, lacunas e recomendacoes". O que o diferencia da aba: ele sai da
tela - impresso ou apresentado - e por isso carrega os **criterios da versao que
a execucao citou**, nao os vigentes no dia da impressao.

Provedor sempre duble (AGENTS.md 0.1).
"""
import tempfile

from django.db.models import F
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.services.base_conhecimento import base_conhecimento
from apps.copilot.models import PropostaEstruturada
from apps.maturity.models import CriterioPreAnalise, VersaoCriterio
from apps.maturity.serializers import AVISO_ORIENTATIVO
from apps.maturity.services import ImportarCriteriosService, PreAnalisarService
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
    indicar_na_equipe,
)
from core.tests.dubles import ProvedorFake, ProvedorIndisponivel, escrever_base_pipe

PROPOSTA = {
    'problema_pesquisa': 'Contaminacao resiste a pasteurizacao.',
    'objetivo_geral': 'Desenvolver protocolo de deteccao rapida.',
    'metodologia': 'Cultivo seletivo e PCR em tempo real.',
}


class RelatorioPreAnaliseBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.diretorio = tempfile.TemporaryDirectory()
        self.base = escrever_base_pipe(self.diretorio.name)

        self.administrador = UsuarioBuilder().administrador().build()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.pesquisador = UsuarioBuilder().pesquisador().build()
        self.demandante = (
            UsuarioBuilder()
            .demandante()
            .na_organizacao(OrganizacaoBuilder().demandante().build())
            .build()
        )

        self.oportunidade = (
            OportunidadeBuilder()
            .interna()
            .intitulada('Deteccao rapida de contaminacao')
            .criada_por(self.supervisor)
            .build()
        )
        self.proposta = PropostaEstruturada.objects.create(
            oportunidade=self.oportunidade, **PROPOSTA
        )

        base_conhecimento.cache_clear()
        self.client.force_authenticate(user=self.supervisor)

    def tearDown(self):
        base_conhecimento.cache_clear()
        self.diretorio.cleanup()

    def url(self):
        return reverse(
            'oportunidade-relatorio-preanalise', args=[self.oportunidade.codigo]
        )

    def importar(self):
        with override_settings(BASE_CONHECIMENTO_PIPE=self.base):
            base_conhecimento.cache_clear()
            return ImportarCriteriosService().execute(ator=self.administrador)

    def analisar(self, provedor=None):
        return PreAnalisarService(provedor=provedor or ProvedorFake()).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )


class DocumentoTests(RelatorioPreAnaliseBaseTests):
    def test_sem_execucao_responde_404_explicado(self):
        """A tela oferece executar, em vez de imprimir folha vazia."""
        resposta = self.client.get(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resposta.data['codigo'], 'preanalise_inexistente')

    def test_documento_traz_dimensoes_lacunas_e_recomendacoes(self):
        """PB78, no ponto que importa do critério de aceite."""
        self.importar()
        self.analisar()

        dados = self.client.get(self.url()).data

        self.assertEqual(len(dados['pre_analise']['dimensoes']), 2)
        self.assertEqual(len(dados['pre_analise']['lacunas']), 1)
        self.assertEqual(len(dados['pre_analise']['recomendacoes']), 1)

    def test_documento_identifica_a_oportunidade_e_a_proposta_avaliada(self):
        self.importar()
        self.analisar()

        dados = self.client.get(self.url()).data

        self.assertEqual(
            dados['oportunidade']['codigo'], self.oportunidade.codigo
        )
        self.assertEqual(
            dados['proposta']['objetivo_geral'],
            'Desenvolver protocolo de deteccao rapida.',
        )
        self.assertIsNotNone(dados['gerado_em'])

    def test_documento_carrega_o_aviso_de_que_e_orientativo(self):
        """AGENTS.md 0.2: impresso, o documento continua nao sendo parecer."""
        self.importar()
        self.analisar()

        self.assertEqual(
            self.client.get(self.url()).data['pre_analise']['aviso'],
            AVISO_ORIENTATIVO,
        )

    def test_criterios_sao_os_da_versao_citada_e_nao_os_de_hoje(self):
        """
        A razao de `CriterioPreAnalise` ser versionado.

        Encerrar a versao e cadastrar outra depois nao pode mudar o documento
        de uma analise que ja aconteceu.
        """
        self.importar()
        self.analisar()

        VersaoCriterio.objects.filter(versao='V9').update(vigente_ate=F('vigente_de'))
        CriterioPreAnalise.objects.create(
            versao_criterio=VersaoCriterio.objects.create(
                versao='V10', vigente_de=timezone.localdate()
            ),
            dimensao='inovacao',
            codigo='X1',
            descricao='Criterio de uma versao posterior.',
        )

        dados = self.client.get(self.url()).data
        codigos = [criterio['codigo'] for criterio in dados['criterios']]

        self.assertEqual(dados['pre_analise']['versao_criterios'], 'V9')
        self.assertNotIn('X1', codigos)
        self.assertIn('A3', codigos)

    def test_documento_traz_a_equipe_que_entrou_na_avaliacao(self):
        self.importar()
        indicar_na_equipe(
            self.oportunidade,
            MembroRedeBuilder().pesquisador().chamado('Marina Alves').build(),
        )
        self.analisar()

        dados = self.client.get(self.url()).data

        self.assertEqual(dados['equipe']['membros'][0]['nome'], 'Marina Alves')

    def test_sem_equipe_o_documento_nao_inventa_composicao(self):
        self.importar()
        self.analisar()

        self.assertIsNone(self.client.get(self.url()).data['equipe'])

    def test_execucao_que_falhou_vira_documento_sem_dimensao(self):
        """
        Imprimir a falha e melhor que esconde-la.

        A execucao existe, com o motivo gravado; o documento a mostra vazia em
        vez de responder 404 e sugerir que nada foi tentado.
        """
        self.importar()
        self.analisar(provedor=ProvedorIndisponivel())

        dados = self.client.get(self.url()).data

        self.assertEqual(dados['pre_analise']['status'], 'erro')
        self.assertEqual(dados['pre_analise']['erro'], 'provedor_indisponivel')
        self.assertEqual(dados['pre_analise']['dimensoes'], [])


class AcessoAoRelatorioTests(RelatorioPreAnaliseBaseTests):
    def test_so_o_supervisor_gera(self):
        """PB78: "como Supervisor quero gerar"."""
        self.importar()
        self.analisar()

        for usuario in (self.pesquisador, self.demandante):
            with self.subTest(papel=usuario.papel):
                self.client.force_authenticate(user=usuario)
                self.assertEqual(
                    self.client.get(self.url()).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_anonimo_nao_gera(self):
        self.client.force_authenticate(user=None)

        self.assertEqual(
            self.client.get(self.url()).status_code, status.HTTP_401_UNAUTHORIZED
        )


class ComoLerTests(RelatorioPreAnaliseBaseTests):
    """O relatorio da pre-analise explica como le-la."""

    def test_explica_os_tres_niveis_e_o_carater_orientativo(self):
        self.importar()
        self.analisar()

        texto = ' '.join(self.client.get(self.url()).data['como_ler'])

        self.assertIn('Consolidada', texto)
        self.assertIn('Em desenvolvimento', texto)
        self.assertIn('Frágil', texto)
        self.assertIn('não é nota, parecer nem decisão da FAPESP', texto)

    def test_cita_a_versao_dos_criterios_analisada(self):
        self.importar()
        analise = self.analisar()

        texto = ' '.join(self.client.get(self.url()).data['como_ler'])

        self.assertIn(analise.versao_criterio.versao, texto)
