"""
Orcamento de round-trips por requisicao.

Por que isto existe como teste, e nao como revisao de codigo: o custo de uma
query N+1 nao aparece em nenhuma linha do codigo. Contra um Postgres local ela
custa 0,2 ms e ninguem percebe; contra um banco remoto custa um RTT, e o tempo
da requisicao passa a ser `numero de queries x RTT`. Foi assim que a fila de
oportunidades chegou a 202 consultas numa tela so - nenhuma delas errada
sozinha.

O que cada caso afirma e a **forma** do custo, nao um numero bonito: dobrar a
quantidade de registros nao pode dobrar a quantidade de consultas. Um teto
absoluto acompanha cada um para o orcamento nao subir sem alguem decidir.

Nada aqui toca banco remoto, SMTP ou provedor de IA (AGENTS.md 0.1).
"""
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APIClient

from apps.decisions.models import Decisao, TipoDecisao
from apps.network.models import Competencia, TipoCompetencia
from apps.opportunities.models import SituacaoOportunidade
from apps.opportunities.services import fila_de
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
)


class OrcamentoDaFilaDeOportunidadesTests(TestCase):
    """
    `GET /api/oportunidades/` - a tela que o Supervisor abre primeiro.

    O front pede `page_size=100` (ver `pdConnectApi.js`), e o serializer
    carregava `total_anexos` e `ultima_decisao` um registro por vez.
    """

    url = reverse('oportunidade-list')

    def setUp(self):
        self.client = APIClient()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.organizacao = OrganizacaoBuilder().demandante().build()
        self.client.force_authenticate(self.supervisor)

    def _povoar(self, quantidade):
        for indice in range(quantidade):
            oportunidade = (
                OportunidadeBuilder()
                .externa(self.organizacao)
                .intitulada(f'Oportunidade {indice}')
                .build()
            )
            Decisao.objects.create(
                oportunidade=oportunidade,
                tipo_decisao=TipoDecisao.CONTINUAR,
                observacoes='Justificativa registrada para o teste.',
                responsavel=self.supervisor,
            )

    def _queries_da_fila(self):
        with CaptureQueriesContext(connection) as capturadas:
            resposta = self.client.get(self.url, {'page_size': '100'})

        self.assertEqual(resposta.status_code, 200)
        return len(capturadas.captured_queries)

    def test_a_fila_nao_cresce_em_queries_com_o_numero_de_registros(self):
        self._povoar(5)
        com_cinco = self._queries_da_fila()

        self._povoar(20)
        com_vinte_e_cinco = self._queries_da_fila()

        self.assertEqual(com_cinco, com_vinte_e_cinco)

    def test_a_fila_cabe_no_orcamento(self):
        """Contagem da paginacao, a pagina, e o lote das decisoes."""
        self._povoar(25)

        self.assertLessEqual(self._queries_da_fila(), 4)

    def test_a_fila_continua_entregando_anexos_e_ultima_decisao(self):
        """
        O orcamento nao pode ser cumprido tirando campo do contrato: a tela de
        acompanhamento le os dois.
        """
        self._povoar(1)

        linha = self.client.get(self.url, {'page_size': '100'}).data['results'][0]

        self.assertEqual(linha['total_anexos'], 0)
        self.assertEqual(linha['ultima_decisao']['tipo'], TipoDecisao.CONTINUAR)
        self.assertEqual(linha['ultima_decisao']['autor_nome'], self.supervisor.nome)


class OrdemDaFilaTests(TestCase):
    """
    A fila volta ordenada - e o `annotate` do orcamento nao pode tirar isso.

    O `Meta.ordering` da Oportunidade nao sobrevive a uma consulta com
    `GROUP BY`: o Django para de aplica-lo e o SQL sai **sem `ORDER BY`**,
    calado. O resultado nao e so "ordem estranha na tela": sem ordem total, o
    `LIMIT/OFFSET` da paginacao escolhe linha diferente a cada pagina, e a
    pagina 2 repete ou pula registro que a 1 ja mostrou.

    O mesmo desempate que `caixa_de` documenta em `notifications`, pela mesma
    razao - aqui o segundo campo e o codigo, que e unico.
    """

    url = reverse('oportunidade-list')

    def setUp(self):
        self.client = APIClient()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.client.force_authenticate(self.supervisor)

    def test_a_fila_vem_da_mais_recente_para_a_mais_antiga(self):
        for indice in range(5):
            OportunidadeBuilder().intitulada(f'Oportunidade {indice}').build()

        codigos = [
            linha['codigo']
            for linha in self.client.get(self.url).data['results']
        ]

        self.assertEqual(codigos, sorted(codigos, reverse=True))

    def test_o_queryset_da_fila_declara_a_propria_ordem(self):
        """
        Afirmado sobre o queryset, e nao so sobre a resposta: com poucos
        registros o banco pode devolver na ordem de insercao por acidente e o
        caso acima passaria com o `ORDER BY` ausente.
        """
        self.assertTrue(fila_de(self.supervisor).ordered)
        self.assertIn('ORDER BY', str(fila_de(self.supervisor).query))


class OrcamentoDaRedeTests(TestCase):
    """`GET /api/rede/` - ja usava `prefetch_related`; o caso trava o ganho."""

    url = reverse('membro-rede-list')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(UsuarioBuilder().supervisor().build())

    def _queries_da_rede(self):
        with CaptureQueriesContext(connection) as capturadas:
            resposta = self.client.get(self.url, {'page_size': '100'})

        self.assertEqual(resposta.status_code, 200)
        return len(capturadas.captured_queries)

    def test_a_rede_nao_cresce_em_queries_com_o_numero_de_membros(self):
        for _ in range(5):
            MembroRedeBuilder().com_competencia('Microbiologia').build()
        com_cinco = self._queries_da_rede()

        for _ in range(20):
            MembroRedeBuilder().com_competencia('Fermentacao').build()

        self.assertEqual(com_cinco, self._queries_da_rede())


class OrcamentoDaSincronizacaoDeCompetenciasTests(TestCase):
    """
    `PATCH /api/rede/{id}` - o Supervisor salvando o perfil (PB16).

    As tres listas da tela (competencias, tecnicas, linhas de pesquisa) moram
    numa tabela so, e a sincronizacao resolvia nome por nome: um `get_or_create`
    da competencia e outro do vinculo, dentro do laco. Treze nomes eram
    cinquenta e quatro consultas - e a tela aceita digitar quantos quiser.
    """

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(UsuarioBuilder().supervisor().build())
        self.membro = MembroRedeBuilder().build()
        self.url = reverse('membro-rede-detail', args=[self.membro.id_membro])

    def _queries_do_patch(self, corpo, url=None):
        with CaptureQueriesContext(connection) as capturadas:
            resposta = self.client.patch(url or self.url, corpo, format='json')

        self.assertEqual(resposta.status_code, 200)
        return len(capturadas.captured_queries)

    def test_salvar_nao_cresce_em_queries_com_o_numero_de_nomes(self):
        """
        Cada membro comeca sem vinculo nenhum, e so a quantidade de nomes
        varia.

        Dois `PATCH` seguidos no mesmo membro nao serviriam de comparacao: o
        segundo tem vinculo antigo para apagar, e o `delete` do Django pula o
        `DELETE` quando nao encontra linha. A diferenca de uma consulta seria
        do estado anterior, nao do tamanho da lista.
        """
        outro = MembroRedeBuilder().build()

        com_tres = self._queries_do_patch({
            'competencias': ['Microbiologia', 'Fermentacao', 'Bioinsumos'],
        })
        com_doze = self._queries_do_patch(
            {
                'competencias': [
                    'Microbiologia', 'Fermentacao', 'Bioinsumos', 'Solos',
                    'Genomica', 'Proteomica', 'Metagenomica', 'Fitopatologia',
                    'Entomologia', 'Bioquimica', 'Nematologia', 'Virologia',
                ],
            },
            url=reverse('membro-rede-detail', args=[outro.id_membro]),
        )

        self.assertEqual(com_tres, com_doze)

    def test_as_tres_listas_juntas_cabem_no_orcamento(self):
        orcamento = self._queries_do_patch({
            'competencias': ['Microbiologia', 'Fermentacao', 'Bioinsumos'],
            'tecnicas': ['PCR', 'HPLC', 'Sequenciamento'],
            'linhas': ['Bioinsumos agricolas', 'Controle biologico'],
        })

        self.assertLessEqual(orcamento, 20)

    def test_nome_repetido_na_mesma_lista_entra_uma_vez(self):
        """O lote nao pode mandar o mesmo par duas vezes: `uq_` recusaria."""
        corpo = {'competencias': ['Microbiologia', 'Microbiologia']}

        self.client.patch(self.url, corpo, format='json')

        self.assertEqual(
            self.client.get(self.url).data['competencias'], ['Microbiologia']
        )

    def test_competencia_ja_existente_e_reaproveitada_e_nao_duplicada(self):
        """`uq_competencia_nome_categoria` recusaria a segunda - o lote nao pode tentar."""
        self.client.patch(
            self.url, {'competencias': ['Microbiologia']}, format='json'
        )
        outro = MembroRedeBuilder().build()

        resposta = self.client.patch(
            reverse('membro-rede-detail', args=[outro.id_membro]),
            {'competencias': ['Microbiologia']},
            format='json',
        )

        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(
            Competencia.objects.filter(
                nome='Microbiologia', tipo=TipoCompetencia.COMPETENCIA
            ).count(),
            1,
        )


class OrcamentoDosIndicadoresTests(TestCase):
    """
    `GET /api/indicadores/` - o painel que abre junto com a sessao (RF14).

    Eram sete consultas sequenciais para montar cinco numeros, cada uma
    repetindo a subconsulta de escopo. Nenhuma delas cresce com a quantidade de
    registros, o que esconde o custo no banco local; remoto, sao sete RTTs
    antes de a tela pintar.

    O eixo e `choices` de enum, de tamanho fixo - por isso aqui o orcamento e
    um teto absoluto, e nao uma comparacao entre dois volumes.
    """

    url = reverse('indicadores')

    def setUp(self):
        self.client = APIClient()
        self.supervisor = UsuarioBuilder().supervisor().build()
        organizacao = OrganizacaoBuilder().demandante().build()

        for situacao in (
            SituacaoOportunidade.ENTRADA,
            SituacaoOportunidade.AGUARDANDO_DECISAO,
            SituacaoOportunidade.ARQUIVADA,
        ):
            oportunidade = (
                OportunidadeBuilder()
                .externa(organizacao)
                .na_situacao(situacao)
                .build()
            )
            Decisao.objects.create(
                oportunidade=oportunidade,
                tipo_decisao=TipoDecisao.CONTINUAR,
                observacoes='Justificativa registrada para o teste.',
                responsavel=self.supervisor,
            )

        MembroRedeBuilder().build()
        self.client.force_authenticate(self.supervisor)

    def test_o_painel_do_supervisor_cabe_no_orcamento(self):
        """Um agregado por conjunto: oportunidades, decisoes e rede."""
        with CaptureQueriesContext(connection) as capturadas:
            resposta = self.client.get(self.url)

        self.assertEqual(resposta.status_code, 200)
        self.assertLessEqual(len(capturadas.captured_queries), 3)

    def test_quem_nao_consulta_a_rede_nao_paga_a_consulta_da_rede(self):
        """
        O Demandante nao recebe `rede` (o total da rede e informacao interna) -
        e tambem nao pode custar a consulta que produziria esse total.
        """
        organizacao = OrganizacaoBuilder().demandante().build()
        demandante = (
            UsuarioBuilder().demandante().na_organizacao(organizacao).build()
        )
        self.client.force_authenticate(demandante)

        with CaptureQueriesContext(connection) as capturadas:
            resposta = self.client.get(self.url)

        self.assertIsNone(resposta.data['rede'])
        self.assertLessEqual(len(capturadas.captured_queries), 2)


class LeituraUnicaDoRegistroTests(TestCase):
    """
    Uma requisicao le a oportunidade do banco uma vez.

    O `partial_update` chamava `self.get_object()` duas vezes: uma para o
    serializer e outra para o service. Sao dois `SELECT` identicos na mesma
    requisicao - e, pior que o custo, duas instancias do mesmo registro, com a
    chance de divergirem se algo escrever entre as duas leituras.
    """

    def setUp(self):
        self.client = APIClient()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.oportunidade = OportunidadeBuilder().build()
        self.client.force_authenticate(self.supervisor)
        self.url = reverse(
            'oportunidade-detail', args=[self.oportunidade.codigo]
        )

    def _selects_na_oportunidade(self, chamada):
        with CaptureQueriesContext(connection) as capturadas:
            resposta = chamada()

        self.assertEqual(resposta.status_code, 200)

        return [
            consulta['sql']
            for consulta in capturadas.captured_queries
            if consulta['sql'].startswith('SELECT')
            and 'FROM "Oportunidade"' in consulta['sql']
        ]

    def test_editar_o_contexto_le_a_oportunidade_uma_vez(self):
        selects = self._selects_na_oportunidade(
            lambda: self.client.patch(
                self.url, {'contexto': 'Contexto revisado.'}, format='json'
            )
        )

        self.assertEqual(len(selects), 1)

    def test_editar_o_contexto_continua_gravando_e_respondendo_o_novo_texto(self):
        resposta = self.client.patch(
            self.url, {'contexto': 'Contexto revisado.'}, format='json'
        )

        self.oportunidade.refresh_from_db()

        self.assertEqual(resposta.data['contexto'], 'Contexto revisado.')
        self.assertEqual(self.oportunidade.contexto, 'Contexto revisado.')
