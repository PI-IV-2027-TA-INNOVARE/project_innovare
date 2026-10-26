"""
Testes dos indicadores de matching e de maturidade (RF14 / PB74, PB75).

As duas historias sao do Supervisor e pedem leitura de acompanhamento: a
capacidade da rede de atender as competencias demandadas (PB74) e o
comportamento das propostas contra os criterios (PB75).

O que estes testes protegem:

- **Ausencia nao e zero.** `houve_rodada` e `houve_execucao` separam "nunca
  rodou" de "rodou e nao cobriu nada".
- **Nivel, nunca nota.** O bloco de maturidade conta dimensoes por nivel; nao
  existe media, pontuacao nem indice.
- **O recorte do ator.** Demandante e Pesquisador nao leem resultado interno
  (PB71).

Provedor sempre duble (AGENTS.md 0.1).
"""
import tempfile

from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.services.base_conhecimento import base_conhecimento
from apps.competencies.models import CompetenciaNecessaria, NivelImportancia
from apps.copilot.models import PropostaEstruturada
from apps.matching.services import ExecutarMatchingService
from apps.maturity.models import NivelDimensao
from apps.maturity.services import ImportarCriteriosService, PreAnalisarService
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
    indicar_na_equipe,
)
from core.tests.dubles import ProvedorFake, escrever_base_pipe

PROPOSTA = {
    'problema_pesquisa': 'Contaminacao resiste a pasteurizacao.',
    'objetivo_geral': 'Desenvolver protocolo de deteccao rapida.',
    'metodologia': 'Cultivo seletivo e PCR em tempo real.',
}


class IndicadoresDeIABaseTests(TestCase):
    url = reverse('indicadores-ia')

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
            OportunidadeBuilder().interna().criada_por(self.supervisor).build()
        )
        self.proposta = PropostaEstruturada.objects.create(
            oportunidade=self.oportunidade, revisada_por_humano=True, **PROPOSTA
        )

        base_conhecimento.cache_clear()
        self.client.force_authenticate(user=self.supervisor)

    def tearDown(self):
        base_conhecimento.cache_clear()
        self.diretorio.cleanup()

    def competencia(self, descricao, nivel=NivelImportancia.ESSENCIAL):
        return CompetenciaNecessaria.objects.create(
            proposta=self.proposta, descricao=descricao, nivel_importancia=nivel
        )

    def rodar_matching(self):
        return ExecutarMatchingService().execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

    def analisar(self):
        with override_settings(BASE_CONHECIMENTO_PIPE=self.base):
            base_conhecimento.cache_clear()
            ImportarCriteriosService().execute(ator=self.administrador)

        equipe = self.oportunidade.equipes_potenciais.first()

        if equipe is None or not equipe.membros.filter(incluido=True).exists():
            indicar_na_equipe(self.oportunidade, MembroRedeBuilder().pesquisador().build())

        return PreAnalisarService(provedor=ProvedorFake()).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )


class MatchingTests(IndicadoresDeIABaseTests):
    def test_sem_rodada_o_bloco_declara_a_ausencia(self):
        """PB74: "nunca rodou" e "rodou e nao cobriu" nao podem ler igual."""
        dados = self.client.get(self.url).data['matching']

        self.assertFalse(dados['houve_rodada'])
        self.assertEqual(dados['execucoes'], 0)
        self.assertIsNone(dados['cobertura_percentual'])

    def test_cobertura_e_a_razao_entre_demandada_e_coberta(self):
        """O critério de aceite pede a capacidade da rede de atender."""
        self.competencia('Microbiologia de alimentos')
        self.competencia('Estatistica aplicada')
        (
            MembroRedeBuilder()
            .pesquisador()
            .integral()
            .com_competencia('Microbiologia de alimentos')
            .build()
        )

        self.rodar_matching()
        dados = self.client.get(self.url).data['matching']

        self.assertTrue(dados['houve_rodada'])
        self.assertEqual(dados['competencias_demandadas'], 2)
        self.assertEqual(dados['competencias_com_lacuna'], 1)
        self.assertEqual(dados['competencias_cobertas'], 1)
        self.assertEqual(dados['cobertura_percentual'], 50.0)

    def test_bloco_separa_sugestao_de_inclusao_manual(self):
        """Quem entrou por score e quem o Supervisor pos a mao (RF08)."""
        self.competencia('Microbiologia de alimentos')
        membro = (
            MembroRedeBuilder()
            .pesquisador()
            .integral()
            .com_competencia('Microbiologia de alimentos')
            .build()
        )

        self.rodar_matching()
        dados = self.client.get(self.url).data['matching']

        self.assertEqual(dados['indicacoes_sugeridas'], 1)
        self.assertEqual(dados['indicacoes_manuais'], 0)
        self.assertIsNotNone(dados['score_medio'])
        self.assertEqual(dados['rede']['total'], 1)
        self.assertEqual(membro.indicacoes.count(), 1)

    def test_rodada_sem_base_semantica_fica_contada(self):
        """Plano 8.3: a tela precisa saber que o score saiu sem o semantico."""
        self.competencia('Microbiologia de alimentos')
        MembroRedeBuilder().pesquisador().build()

        self.rodar_matching()
        dados = self.client.get(self.url).data['matching']

        self.assertEqual(dados['execucoes_sem_base_semantica'], 1)
        self.assertEqual(dados['execucoes_com_rerank'], 0)

    def test_disponibilidade_sem_ninguem_aparece_zerada(self):
        """Mesma regra do painel: valor do enum sem ocorrencia nao desaparece."""
        MembroRedeBuilder().pesquisador().integral().build()

        eixo = self.client.get(self.url).data['matching']['rede'][
            'por_disponibilidade'
        ]
        valores = {item['valor']: item['total'] for item in eixo}

        self.assertEqual(len(eixo), 4)
        self.assertEqual(valores['integral'], 1)
        self.assertEqual(valores['indisponivel'], 0)


class MaturidadeTests(IndicadoresDeIABaseTests):
    def test_sem_execucao_o_bloco_declara_a_ausencia(self):
        dados = self.client.get(self.url).data['maturidade']

        self.assertFalse(dados['houve_execucao'])
        self.assertEqual(dados['dimensoes_avaliadas'], 0)
        self.assertIsNone(dados['versao_criterios'])

    def test_dimensoes_contam_por_nivel(self):
        """PB75: o comparavel entre execucoes e o nivel, nunca uma nota."""
        self.analisar()
        dados = self.client.get(self.url).data['maturidade']

        niveis = {item['valor']: item['total'] for item in dados['por_nivel']}

        self.assertTrue(dados['houve_execucao'])
        self.assertEqual(dados['dimensoes_avaliadas'], 2)
        self.assertEqual(niveis[NivelDimensao.CONSOLIDADA], 1)
        self.assertEqual(niveis[NivelDimensao.EM_DESENVOLVIMENTO], 1)
        self.assertEqual(niveis[NivelDimensao.FRAGIL], 0)

    def test_bloco_traz_lacunas_e_recomendacoes_da_pre_analise(self):
        self.analisar()
        dados = self.client.get(self.url).data['maturidade']

        self.assertEqual(dados['lacunas'], 1)
        self.assertEqual(dados['lacunas_abertas'], 1)
        self.assertEqual(dados['recomendacoes'], 1)
        self.assertEqual(dados['recomendacoes_acatadas'], 0)

    def test_bloco_cita_a_versao_de_criterios_vigente(self):
        self.analisar()

        self.assertEqual(
            self.client.get(self.url).data['maturidade']['versao_criterios'], 'V9'
        )

    def test_contagem_nao_inventa_media_nem_pontuacao(self):
        """`CONTEXT.md` secao 4: nunca nota, parecer ou score de maturidade."""
        self.analisar()
        campos = ' '.join(self.client.get(self.url).data['maturidade'].keys())

        for proibido in ('nota', 'media', 'score', 'pontuacao', 'indice'):
            self.assertNotIn(proibido, campos)


class AcessoAosIndicadoresDeIATests(IndicadoresDeIABaseTests):
    def test_so_o_supervisor_le(self):
        """PB74 e PB75 sao historias do Supervisor; PB71 corta o Demandante."""
        for usuario in (self.pesquisador, self.demandante, self.administrador):
            with self.subTest(papel=usuario.papel):
                self.client.force_authenticate(user=usuario)
                self.assertEqual(
                    self.client.get(self.url).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_anonimo_nao_le(self):
        self.client.force_authenticate(user=None)

        self.assertEqual(
            self.client.get(self.url).status_code, status.HTTP_401_UNAUTHORIZED
        )

    def test_bloco_cabe_no_orcamento_de_consultas(self):
        """
        Um agregado por conjunto, nao um por numero.

        A rota e separada de `/api/indicadores/` justamente porque le cinco
        tabelas das fases 3.2/3.3; o que ela nao pode e crescer com o volume.
        """
        self.competencia('Microbiologia de alimentos')
        MembroRedeBuilder().pesquisador().build()
        self.rodar_matching()
        self.analisar()

        with CaptureQueriesContext(connection) as capturadas:
            resposta = self.client.get(self.url)

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertLessEqual(len(capturadas.captured_queries), 12)

    def test_indicadores_essenciais_nao_pagam_pelo_bloco_novo(self):
        """O painel que abre com a sessao segue com o orcamento dele."""
        with CaptureQueriesContext(connection) as capturadas:
            resposta = self.client.get(reverse('indicadores'))

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertLessEqual(len(capturadas.captured_queries), 3)
