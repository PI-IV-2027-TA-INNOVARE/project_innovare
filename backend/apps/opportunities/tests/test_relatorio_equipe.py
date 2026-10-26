"""
Testes do Relatorio de Equipe Potencial (PB77).

PB77 e *Should Have*, **fora do MVP**, e pede "documento com a composicao da
equipe e as respectivas aderencias de matching". O que o diferencia da aba: ele
sai da tela, e por isso leva junto os **pesos da rodada** e as **competencias
necessarias** que ela comparou - sem a regua, a aderencia e um numero solto.

Nenhum convite, aceite ou recusa aparece no documento (RN-A06 / D07).
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.competencies.models import CompetenciaNecessaria, NivelImportancia
from apps.copilot.models import PropostaEstruturada
from apps.matching.services import ExecutarMatchingService
from apps.network.models import PapelNaRede
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
)

PROPOSTA = {
    'problema_pesquisa': 'Contaminacao resiste a pasteurizacao.',
    'objetivo_geral': 'Desenvolver protocolo de deteccao rapida.',
    'metodologia': 'Cultivo seletivo e PCR em tempo real.',
}


class RelatorioEquipeBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()

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

        self.essencial = CompetenciaNecessaria.objects.create(
            proposta=self.proposta,
            descricao='Microbiologia de alimentos',
            nivel_importancia=NivelImportancia.ESSENCIAL,
        )
        self.desejavel = CompetenciaNecessaria.objects.create(
            proposta=self.proposta,
            descricao='Estatistica aplicada',
            nivel_importancia=NivelImportancia.DESEJAVEL,
        )

        self.especialista = (
            MembroRedeBuilder()
            .pesquisador()
            .chamado('Marina Alves')
            .com_titulacao('doutorado')
            .integral()
            .com_competencia('Microbiologia de alimentos')
            .build()
        )

        self.client.force_authenticate(user=self.supervisor)

    def url(self):
        return reverse(
            'oportunidade-relatorio-equipe', args=[self.oportunidade.codigo]
        )

    def rodar(self):
        return ExecutarMatchingService().execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )


class DocumentoTests(RelatorioEquipeBaseTests):
    def test_sem_matching_responde_404_explicado(self):
        """Nao ha composicao a documentar: a tela oferece rodar o matching."""
        resposta = self.client.get(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resposta.data['codigo'], 'equipe_inexistente')

    def test_documento_traz_a_composicao_com_a_aderencia(self):
        """PB77, no ponto do critério de aceite."""
        self.rodar()

        dados = self.client.get(self.url()).data
        membro = dados['equipe']['membros'][0]

        self.assertEqual(membro['nome'], 'Marina Alves')
        self.assertEqual(membro['papel'], PapelNaRede.PESQUISADOR)
        self.assertIsNotNone(membro['score_compatibilidade'])
        self.assertTrue(membro['match_reasons'])

    def test_documento_leva_os_pesos_da_rodada(self):
        """
        Aderencia sem regua nao se interpreta.

        O mesmo 0,62 significa coisas diferentes se o PO mexeu nos pesos entre
        uma rodada e outra - e por isso a execucao viaja com o documento.
        """
        self.rodar()

        execucao = self.client.get(self.url()).data['equipe']['execucao']

        self.assertEqual(execucao['estrategia'], 'hibrido_v1')
        self.assertIn('componentes', execucao['pesos'])
        self.assertTrue(execucao['fallback_usado'])

    def test_documento_lista_as_competencias_comparadas(self):
        self.rodar()

        descricoes = [
            item['descricao'] for item in self.client.get(self.url()).data['competencias']
        ]

        self.assertEqual(
            sorted(descricoes), ['Estatistica aplicada', 'Microbiologia de alimentos']
        )

    def test_documento_declara_a_lacuna_da_composicao(self):
        """RF08: o que a equipe sugerida nao cobre faz parte do resultado."""
        self.rodar()

        lacunas = self.client.get(self.url()).data['equipe']['lacunas']

        self.assertEqual(len(lacunas), 1)
        self.assertEqual(lacunas[0]['competencia'], 'Estatistica aplicada')

    def test_documento_identifica_a_oportunidade_e_o_instante(self):
        self.rodar()

        dados = self.client.get(self.url()).data

        self.assertEqual(dados['oportunidade']['codigo'], self.oportunidade.codigo)
        self.assertIsNotNone(dados['gerado_em'])

    def test_documento_nao_tem_aceite_nem_convite(self):
        """RN-A06 / D07: nem no documento existe onde registrar aceite."""
        self.rodar()

        campos = set(self.client.get(self.url()).data['equipe']['membros'][0])

        self.assertEqual(campos & {'aceite', 'aceito', 'recusa', 'convite'}, set())


class AcessoAoRelatorioDaEquipeTests(RelatorioEquipeBaseTests):
    def test_so_o_supervisor_gera(self):
        """PB77: "como Supervisor quero gerar"."""
        self.rodar()

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


class ComoFoiCalculadoTests(RelatorioEquipeBaseTests):
    """O relatorio guarda a explicacao que saiu da tela."""

    def test_explica_as_quatro_parcelas_com_os_pesos_da_rodada(self):
        self.rodar()

        texto = ' '.join(self.client.get(self.url()).data['como_foi_calculado'])

        self.assertIn('afinidade com o tema (45%)', texto)
        self.assertIn('palavras em comum (20%)', texto)
        self.assertIn('área de atuação (25%)', texto)
        self.assertIn('disponibilidade (10%)', texto)

    def test_avisa_quando_a_afinidade_com_o_tema_ficou_de_fora(self):
        self.rodar()

        texto = ' '.join(self.client.get(self.url()).data['como_foi_calculado'])

        self.assertIn('a afinidade com o tema não estava disponível', texto)

    def test_lembra_que_a_sugestao_nao_e_convocacao(self):
        self.rodar()

        texto = ' '.join(self.client.get(self.url()).data['como_foi_calculado'])

        self.assertIn('o Supervisor valida e ajusta', texto)

    def test_nao_usa_jargao(self):
        self.rodar()

        texto = ' '.join(self.client.get(self.url()).data['como_foi_calculado']).lower()

        for termo in ('score', 'rerank', 'fallback', 'embedding'):
            self.assertNotIn(termo, texto)
