"""
Indicadores essenciais do fluxo (RF14).

Numeros do fluxo, nao business intelligence: quantas oportunidades existem, em
que etapa estao, de onde vieram e como foram decididas.

O recorte e o mesmo da fila: `escopo_de`. Um indicador que contasse fora do
escopo do ator seria vazamento por agregacao - o Demandante descobriria
quantos problemas as outras organizacoes abriram sem conseguir abrir nenhum.

Nada aqui toca banco remoto, SMTP real ou provedor de IA (AGENTS.md 0.1).
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.decisions.models import Decisao, TipoDecisao
from apps.matching.models import EquipePotencial, MembroEquipe
from apps.network.models import PapelNaRede
from apps.opportunities.models import SituacaoOportunidade
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
)


class IndicadoresBaseTests(TestCase):
    url = reverse('indicadores')

    def setUp(self):
        self.client = APIClient()

        self.vale_verde = OrganizacaoBuilder().demandante().chamada('Vale Verde').build()
        self.terra_boa = OrganizacaoBuilder().demandante().chamada('Terra Boa').build()

        self.supervisor = UsuarioBuilder().supervisor().build()
        self.administrador = UsuarioBuilder().administrador().build()
        self.demandante = (
            UsuarioBuilder().demandante().na_organizacao(self.vale_verde).build()
        )
        self.usuario_pesquisador = UsuarioBuilder().pesquisador().build()
        self.membro = (
            MembroRedeBuilder()
            .pesquisador()
            .com_acesso(self.usuario_pesquisador)
            .build()
        )

        self.do_vale = (
            OportunidadeBuilder()
            .externa(self.vale_verde)
            .na_situacao(SituacaoOportunidade.ENTRADA)
            .build()
        )
        self.da_terra = (
            OportunidadeBuilder()
            .externa(self.terra_boa)
            .na_situacao(SituacaoOportunidade.MATCHING)
            .build()
        )
        self.interna = (
            OportunidadeBuilder()
            .interna()
            .na_situacao(SituacaoOportunidade.MATCHING)
            .build()
        )

        Decisao.objects.create(
            oportunidade=self.da_terra,
            tipo_decisao=TipoDecisao.CONTINUAR,
            observacoes='Maturidade suficiente.',
            responsavel=self.supervisor,
        )

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def indicadores(self):
        return self.client.get(self.url)

    def contagem(self, bloco, chave, valor):
        return next(
            (item['total'] for item in bloco[chave] if item['valor'] == valor), 0
        )


class EscopoDosIndicadoresTests(IndicadoresBaseTests):
    def test_supervisor_conta_a_fila_inteira(self):
        self.como(self.supervisor)
        dados = self.indicadores().data

        self.assertEqual(dados['oportunidades']['total'], 3)
        self.assertEqual(
            self.contagem(dados['oportunidades'], 'por_situacao', 'matching'), 2
        )
        self.assertEqual(
            self.contagem(dados['oportunidades'], 'por_origem', 'externo'), 2
        )

    def test_demandante_conta_so_a_propria_organizacao(self):
        """Agregado tambem vaza: o total e uma leitura do que nao lhe cabe."""
        self.como(self.demandante)
        dados = self.indicadores().data

        self.assertEqual(dados['oportunidades']['total'], 1)
        self.assertEqual(
            self.contagem(dados['oportunidades'], 'por_situacao', 'entrada'), 1
        )

    def test_pesquisador_conta_so_onde_integra_a_equipe(self):
        self.como(self.usuario_pesquisador)

        self.assertEqual(self.indicadores().data['oportunidades']['total'], 0)

        MembroEquipe.objects.create(
            equipe=EquipePotencial.objects.create(oportunidade=self.interna),
            membro=self.membro,
            papel=PapelNaRede.PESQUISADOR,
        )

        self.assertEqual(self.indicadores().data['oportunidades']['total'], 1)

    def test_administrador_nao_acompanha_o_fluxo(self):
        """
        A matriz de responsabilidades da ao Administrador o administrativo.

        Ele gere contas e configuracao; o andamento das oportunidades nao e
        dele - e o console tem a trilha para o que precisa auditar.
        """
        self.como(self.administrador)

        self.assertEqual(self.indicadores().status_code, status.HTTP_403_FORBIDDEN)

    def test_anonimo_nao_le_indicador(self):
        self.assertEqual(self.indicadores().status_code, status.HTTP_401_UNAUTHORIZED)


class ConteudoDosIndicadoresTests(IndicadoresBaseTests):
    def test_decisoes_contam_dentro_do_escopo(self):
        self.como(self.supervisor)
        dados = self.indicadores().data

        self.assertEqual(dados['decisoes']['total'], 1)
        self.assertEqual(self.contagem(dados['decisoes'], 'por_tipo', 'continuar'), 1)

    def test_demandante_nao_conta_decisao_de_outra_organizacao(self):
        self.como(self.demandante)

        self.assertEqual(self.indicadores().data['decisoes']['total'], 0)

    def test_rede_so_aparece_para_quem_pode_consultar_a_rede(self):
        """
        O tamanho da rede e informacao interna.

        Quem nao alcanca `/api/rede/` tambem nao deve alcancar a contagem
        dela: o agregado responderia a pergunta que a rota nega.
        """
        self.como(self.supervisor)
        self.assertIn('rede', self.indicadores().data)

        self.como(self.usuario_pesquisador)
        self.assertIn('rede', self.indicadores().data)

        self.como(self.demandante)
        self.assertIsNone(self.indicadores().data['rede'])

    def test_rede_conta_por_papel(self):
        self.como(self.supervisor)
        rede = self.indicadores().data['rede']

        self.assertEqual(rede['total'], 1)
        self.assertEqual(self.contagem(rede, 'por_papel', 'pesquisador'), 1)

    def test_toda_contagem_traz_rotulo_legivel(self):
        """A tela mostra 'Em matching', nao 'matching'."""
        self.como(self.supervisor)
        dados = self.indicadores().data

        situacoes = {i['valor']: i['rotulo'] for i in dados['oportunidades']['por_situacao']}

        self.assertEqual(situacoes['matching'], 'Matching')
        self.assertNotEqual(situacoes['pre_analise'], 'pre_analise')

    def test_situacao_sem_ocorrencia_aparece_zerada(self):
        """
        Etapa vazia some do `values()` do banco e sumiria do grafico.

        Uma etapa ausente le-se como 'nao existe', e nao como 'ninguem esta
        nela' - que e o que o Supervisor precisa enxergar.
        """
        self.como(self.supervisor)
        dados = self.indicadores().data

        valores = [i['valor'] for i in dados['oportunidades']['por_situacao']]

        self.assertEqual(valores, [v for v, _ in SituacaoOportunidade.choices])
        self.assertEqual(
            self.contagem(dados['oportunidades'], 'por_situacao', 'pre_analise'), 0
        )
