"""
A pre-analise recebe os criterios PIPE, e cada recomendacao responde a uma
lacuna, com o criterio de origem ou marcada "sem evidencia".

Antes, a tela dizia que a analise usava os criterios e o prompt nao os
recebia; e as recomendacoes voltavam soltas, sem a lacuna que resolviam.
"""
import tempfile

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.ai.services.base_conhecimento import base_conhecimento
from apps.copilot.models import Lacuna, PropostaEstruturada
from apps.maturity.models import Recomendacao
from apps.maturity.services import ImportarCriteriosService, PreAnalisarService
from core.tests.builders import OportunidadeBuilder, UsuarioBuilder
from core.tests.dubles import PREANALISE_PADRAO, ProvedorFake, escrever_base_pipe

PROPOSTA = {
    'problema_pesquisa': 'Contaminação resiste à pasteurização.',
    'objetivo_geral': 'Desenvolver protocolo de detecção rápida.',
    'metodologia': 'Cultivo seletivo e PCR em tempo real.',
}


def resposta_com(lacunas, recomendacoes):
    dados = dict(PREANALISE_PADRAO)
    dados['lacunas'] = lacunas
    dados['recomendacoes'] = recomendacoes
    return dados


class CriteriosNoPromptTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.diretorio = tempfile.TemporaryDirectory()
        self.base = escrever_base_pipe(self.diretorio.name)
        base_conhecimento.cache_clear()

        administrador = UsuarioBuilder().administrador().build()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.oportunidade = OportunidadeBuilder().interna().criada_por(self.supervisor).build()
        PropostaEstruturada.objects.create(oportunidade=self.oportunidade, **PROPOSTA)

        self.override = override_settings(BASE_CONHECIMENTO_PIPE=self.base)
        self.override.enable()
        base_conhecimento.cache_clear()
        ImportarCriteriosService().execute(ator=administrador)

    def tearDown(self):
        self.override.disable()
        base_conhecimento.cache_clear()
        self.diretorio.cleanup()

    def analisar(self, provedor):
        return PreAnalisarService(provedor=provedor).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

    def test_o_pedido_leva_os_criterios_da_versao_vigente_por_dimensao(self):
        provedor = ProvedorFake()

        self.analisar(provedor)

        criterios = provedor.pedidos['pre_analise_pipe']['criterios']
        por_dimensao = dict(criterios['por_dimensao'])

        self.assertEqual(criterios['versao'], 'V9')
        self.assertEqual(criterios['baseline_id'], 'PIPE_TESTE_V9')
        self.assertEqual(por_dimensao['plano_pesquisa'][0]['codigo'], 'A3')
        self.assertEqual(por_dimensao['plano_pesquisa'][0]['rotulo'], 'Metodologia adequada')
        self.assertEqual(
            por_dimensao['plano_pesquisa'][0]['pergunta'],
            'A metodologia e adequada aos objetivos?',
        )
        self.assertEqual(por_dimensao['infraestrutura'][0]['codigo'], 'F1')

    def test_a_recomendacao_fica_ligada_a_lacuna_e_ao_criterio(self):
        self.analisar(ProvedorFake(preanalise=resposta_com(
            [{'id': 'L1', 'dimensao': 'plano_pesquisa', 'criterio': 'A3',
              'descricao': 'Falta o controle negativo.'}],
            [{'lacuna': 'L1', 'criterio': 'A3', 'texto': 'Defina o controle negativo.',
              'sem_evidencia': False}],
        )))

        recomendacao = Recomendacao.objects.get()
        self.assertEqual(recomendacao.lacuna.descricao, 'Falta o controle negativo.')
        self.assertEqual(recomendacao.lacuna.criterio.codigo, 'A3')
        self.assertEqual(recomendacao.lacuna.recomendacao, 'Defina o controle negativo.')

    def test_a_lacuna_com_criterio_fica_na_dimensao_do_criterio(self):
        """A dimensao do criterio vale sobre a que a IA escreveu: as duas nao divergem."""
        self.analisar(ProvedorFake(preanalise=resposta_com(
            [{'id': 'L1', 'dimensao': 'viabilidade', 'criterio': 'A3',
              'descricao': 'Falta o controle negativo.'}],
            [{'lacuna': 'L1', 'criterio': 'A3', 'texto': 'Defina o controle negativo.',
              'sem_evidencia': False}],
        )))

        lacuna = Lacuna.objects.get(descricao='Falta o controle negativo.')
        self.assertEqual(lacuna.criterio.codigo, 'A3')
        self.assertEqual(lacuna.campo_afetado, 'plano_pesquisa')

    def test_recomendacao_sem_evidencia_fica_sem_criterio(self):
        self.analisar(ProvedorFake(preanalise=resposta_com(
            [{'id': 'L1', 'dimensao': 'viabilidade', 'criterio': 'A3',
              'descricao': 'Não há prazo.'}],
            [{'lacuna': 'L1', 'criterio': 'A3', 'texto': 'Monte um cronograma.',
              'sem_evidencia': True}],
        )))

        self.assertIsNone(Lacuna.objects.get(descricao='Não há prazo.').criterio)

    def test_a_tela_recebe_a_lacuna_o_criterio_e_a_marca_sem_evidencia(self):
        self.analisar(ProvedorFake(preanalise=resposta_com(
            [{'id': 'L1', 'dimensao': 'plano_pesquisa', 'criterio': 'A3',
              'descricao': 'Falta o controle negativo.'},
             {'id': 'L2', 'dimensao': 'viabilidade', 'criterio': '',
              'descricao': 'Não há prazo.'}],
            [{'lacuna': 'L1', 'criterio': 'A3', 'texto': 'Defina o controle negativo.'},
             {'lacuna': 'L2', 'texto': 'Monte um cronograma.', 'sem_evidencia': True}],
        )))
        self.client.force_authenticate(self.supervisor)

        dados = self.client.get(
            reverse('oportunidade-pre-analise', args=[self.oportunidade.codigo])
        ).data

        por_texto = {item['texto']: item for item in dados['recomendacoes']}
        ligada = por_texto['Defina o controle negativo.']
        solta = por_texto['Monte um cronograma.']

        self.assertIsNotNone(ligada['id_lacuna'])
        self.assertEqual(ligada['criterio_codigo'], 'A3')
        self.assertEqual(ligada['criterio_rotulo'], 'Metodologia adequada')
        self.assertFalse(ligada['sem_evidencia'])
        self.assertTrue(solta['sem_evidencia'])

    def test_o_texto_segue_orientativo(self):
        analise = self.analisar(ProvedorFake())

        texto = ' '.join(
            [analise.sintese]
            + [dimensao.avaliacao for dimensao in analise.dimensoes.all()]
        ).lower()

        for palavra in ('nota', 'parecer', 'aprovação', 'decisão da fapesp'):
            self.assertNotIn(palavra, texto)
