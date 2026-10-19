"""
Testes do Relatorio de Oportunidade (PB76).

PB76 pede "documento com visao consolidada apta para consulta ou
apresentacao". Consolidar, aqui, e juntar numa leitura so o que hoje esta
espalhado por quatro chamadas - contexto, anexos, decisao e trilha - mais a
Proposta Estruturada, que a P22 destravou.

As secoes que dependem das fases seguintes (competencias, equipe potencial e
pre-analise) **aparecem declaradas como pendentes, com motivo**, em vez de
sumirem do documento: um relatorio que omite a secao faz o leitor concluir que
ela nao existe no produto, e o plano 6.8 ja rejeitou moldura que simula
resultado.

Nenhum teste toca banco remoto, SMTP real ou provedor de IA (AGENTS.md 0.1).
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Papel, Usuario
from apps.network.models import MembroRede, PapelNaRede, SituacaoMembro
from apps.opportunities.models import Oportunidade
from apps.organizations.models import Organizacao, TipoOrganizacao

SENHA = 'Bioinsumo!2026'

SECOES_DAS_FASES_SEGUINTES = (
    'competencias_necessarias',
    'equipe_potencial',
    'pre_analise',
)


class RelatorioBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.vale_verde = Organizacao.objects.create(
            tipo=TipoOrganizacao.DEMANDANTE,
            nome='Agroindustria Vale Verde',
            cnpj='12345678000199',
        )

        self.supervisor = Usuario.objects.create_user(
            email='supervisor@ac2microbiologia.com.br',
            nome='Rafael Antunes', papel=Papel.SUPERVISOR, password=SENHA,
        )
        self.pesquisador = Usuario.objects.create_user(
            email='pesquisador@ac2microbiologia.com.br',
            nome='Maria Ferreira', papel=Papel.PESQUISADOR, password=SENHA,
        )
        self.demandante = Usuario.objects.create_user(
            email='demandante@valeverde.com.br',
            nome='Agroindustria Vale Verde', papel=Papel.DEMANDANTE,
            organizacao=self.vale_verde, password=SENHA,
        )

        MembroRede.objects.create(
            usuario=self.pesquisador, nome='Maria Ferreira',
            email=self.pesquisador.email, papel_rede=PapelNaRede.PESQUISADOR,
            situacao=SituacaoMembro.ATIVO,
        )

        self.como(self.demandante)
        self.codigo = self.client.post(
            reverse('oportunidade-list'),
            {'titulo': 'Contaminacao na linha de envase',
             'resumo': 'Perdas por contaminacao microbiana.'},
            format='json',
        ).data['codigo']

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def url(self):
        return reverse('oportunidade-relatorio', args=[self.codigo])

    def relatorio(self):
        return self.client.get(self.url())


class AlcanceDoRelatorioTests(RelatorioBaseTests):
    """
    PB76 e historia do Supervisor: o plano 6.4 lista o relatorio na tela dele,
    e nenhuma das outras secoes de tela o oferece.
    """

    def test_supervisor_obtem_o_relatorio(self):
        self.como(self.supervisor)

        self.assertEqual(self.relatorio().status_code, status.HTTP_200_OK)

    def test_demandante_nao_alcanca_o_relatorio(self):
        """
        PB71 lhe da o andamento "sem acessar informacoes internas restritas", e
        o relatorio consolida justamente o trabalho interno.
        """
        self.como(self.demandante)

        self.assertEqual(self.relatorio().status_code, status.HTTP_403_FORBIDDEN)

    def test_pesquisador_nao_alcanca_o_relatorio(self):
        self.como(self.pesquisador)

        self.assertEqual(self.relatorio().status_code, status.HTTP_403_FORBIDDEN)

    def test_anonimo_nao_alcanca_o_relatorio(self):
        self.client.force_authenticate(user=None)

        self.assertEqual(self.relatorio().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_codigo_inexistente_responde_404(self):
        self.como(self.supervisor)

        resposta = self.client.get(
            reverse('oportunidade-relatorio', args=['OP-2026-999'])
        )

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)


class ConteudoDoRelatorioTests(RelatorioBaseTests):
    def test_consolida_identificacao_e_entrada_numa_chamada_so(self):
        self.como(self.supervisor)

        dados = self.relatorio().data

        self.assertEqual(dados['oportunidade']['codigo'], self.codigo)
        self.assertEqual(
            dados['oportunidade']['titulo'], 'Contaminacao na linha de envase'
        )
        self.assertEqual(dados['oportunidade']['origem'], 'externo')
        self.assertEqual(
            dados['oportunidade']['demandante_nome'], 'Agroindustria Vale Verde'
        )

    def test_carimba_quando_o_documento_foi_gerado(self):
        """
        O relatorio e foto, nao espelho: impresso ou apresentado, ele precisa
        dizer de quando e, senao nao da para saber o que ja mudou desde entao.
        """
        self.como(self.supervisor)

        self.assertIn('gerado_em', self.relatorio().data)

    def test_traz_a_trilha_da_oportunidade(self):
        self.como(self.supervisor)

        historico = self.relatorio().data['historico']

        self.assertGreaterEqual(len(historico), 1)
        self.assertIn('tipo', historico[0])

    def test_traz_os_anexos_mesmo_quando_nao_ha_nenhum(self):
        """Secao vazia e informacao: diz que nao houve documento, nao some."""
        self.como(self.supervisor)

        self.assertEqual(self.relatorio().data['anexos'], [])

    def test_sem_decisao_registrada_a_secao_vem_nula(self):
        self.como(self.supervisor)

        self.assertIsNone(self.relatorio().data['decisao'])

    def test_a_decisao_do_supervisor_entra_no_relatorio(self):
        self.como(self.supervisor)
        self.client.post(
            reverse('oportunidade-decisao', args=[self.codigo]),
            {'tipo': 'continuar', 'justificativa': 'Aderente ao portfolio da AC2.'},
            format='json',
        )

        decisao = self.relatorio().data['decisao']

        self.assertEqual(decisao['tipo'], 'continuar')
        self.assertEqual(decisao['justificativa'], 'Aderente ao portfolio da AC2.')


class SecoesPendentesTests(RelatorioBaseTests):
    """
    O relatorio declara o que ainda nao tem, e por que. Omitir faria o leitor
    concluir que a secao nao existe no produto.
    """

    def test_proposta_nao_iniciada_vira_pendencia_explicada(self):
        self.como(self.supervisor)

        dados = self.relatorio().data
        pendentes = {item['secao']: item['motivo'] for item in dados['pendentes']}

        self.assertIsNone(dados['proposta'])
        self.assertIn('proposta_estruturada', pendentes)
        self.assertTrue(pendentes['proposta_estruturada'])

    def test_proposta_iniciada_sai_da_lista_de_pendencias(self):
        self.como(self.supervisor)
        self.client.post(reverse('oportunidade-proposta', args=[self.codigo]))

        dados = self.relatorio().data
        pendentes = [item['secao'] for item in dados['pendentes']]

        self.assertIsNotNone(dados['proposta'])
        self.assertNotIn('proposta_estruturada', pendentes)

    def test_a_proposta_preenchida_chega_ao_relatorio(self):
        self.como(self.supervisor)
        self.client.post(reverse('oportunidade-proposta', args=[self.codigo]))
        self.client.patch(
            reverse('oportunidade-proposta', args=[self.codigo]),
            {'problema_pesquisa': 'Alicyclobacillus resiste a pasteurizacao.'},
            format='json',
        )

        proposta = self.relatorio().data['proposta']

        self.assertEqual(
            proposta['problema_pesquisa'],
            'Alicyclobacillus resiste a pasteurizacao.',
        )

    def test_as_secoes_das_fases_seguintes_vem_declaradas_com_motivo(self):
        self.como(self.supervisor)

        pendentes = {
            item['secao']: item['motivo']
            for item in self.relatorio().data['pendentes']
        }

        for secao in SECOES_DAS_FASES_SEGUINTES:
            with self.subTest(secao=secao):
                self.assertIn(secao, pendentes)
                self.assertTrue(pendentes[secao])

    def test_nenhuma_pendencia_cita_sigla_de_requisito_ou_fase(self):
        """
        O motivo vai para a tela, e tela nao fala a lingua da baseline: nada de
        `PB42`, `RF05` ou "Fase 3.3" (plano 6.7).
        """
        self.como(self.supervisor)

        for item in self.relatorio().data['pendentes']:
            with self.subTest(secao=item['secao']):
                motivo = item['motivo']
                self.assertNotRegex(motivo, r'\b(PB|RF|RN|EP)[-\s]?\d')
                self.assertNotRegex(motivo, r'(?i)\bfase\s*\d')


class EscopoDoRelatorioTests(RelatorioBaseTests):
    def test_o_relatorio_respeita_o_escopo_de_leitura_do_supervisor(self):
        """
        O relatorio nao abre porta lateral: ele le pelo mesmo queryset da fila,
        entao o que o ator nao alcanca na lista tambem nao alcanca aqui.
        """
        outra = Oportunidade.objects.create(
            codigo='OP-2026-777',
            titulo='Fora do alcance',
            origem='interna',
            situacao='entrada',
        )

        self.como(self.supervisor)
        resposta = self.client.get(
            reverse('oportunidade-relatorio', args=[outra.codigo])
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
