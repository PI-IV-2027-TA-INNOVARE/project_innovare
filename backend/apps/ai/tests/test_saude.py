"""
Testes da pagina de Saude e consumo de IA (plano 5.2).

As duas restricoes que a tela transforma em evidencia: **3 s** por operacao
convencional (`CONTEXT.md` secao 6) e o teto de **~R$ 50/mes** (secao 2).

O que esta sob prova: o recorte por mes de calendario (o teto e mensal), a
ausencia declarada em vez de zero enganoso, e o portao do Administrador.
"""
from decimal import Decimal

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import ExecucaoIA, StatusExecucao, TipoExecucaoIA
from apps.ai.services.saude import inicio_do_mes, saude_da_plataforma
from core.medicao import medidor
from core.tests.builders import UsuarioBuilder


def execucao(**campos):
    padrao = {
        'tipo': TipoExecucaoIA.COPILOTO,
        'provedor': 'google',
        'modelo': 'gemini-2.5-flash',
        'status': StatusExecucao.OK,
        'custo_estimado': Decimal('1.500000'),
        'latencia_ms': 800,
        'tokens_entrada': 1000,
        'tokens_saida': 500,
    }
    padrao.update(campos)

    return ExecucaoIA.objects.create(**padrao)


class SaudeBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.administrador = UsuarioBuilder().administrador().build()
        self.supervisor = UsuarioBuilder().supervisor().build()
        medidor().zerar()
        self.client.force_authenticate(user=self.administrador)

    def url(self):
        return reverse('ia-saude')


class ConsumoDeIATests(SaudeBaseTests):
    def test_consumo_soma_o_mes_corrente_contra_o_teto(self):
        """Secao 2: o teto e mensal, e o numero tem de casar com a fatura."""
        execucao()
        execucao(tipo=TipoExecucaoIA.MATCHING)

        with override_settings(AI_CUSTO_TETO_MENSAL_BRL=50.0):
            dados = saude_da_plataforma()['ia']

        self.assertEqual(dados['chamadas'], 2)
        self.assertEqual(dados['custo_estimado_brl'], 3.0)
        self.assertEqual(dados['percentual_do_teto'], 6.0)
        self.assertEqual(dados['por_tipo'][TipoExecucaoIA.MATCHING], 1)

    def test_execucao_do_mes_anterior_nao_entra_na_janela(self):
        """"Ultimos 30 dias" nunca casaria com o fechamento mensal."""
        antiga = execucao()
        ExecucaoIA.objects.filter(pk=antiga.pk).update(
            criado_em=inicio_do_mes() - timezone.timedelta(days=1)
        )

        self.assertEqual(saude_da_plataforma()['ia']['chamadas'], 0)

    def test_fallback_e_erro_aparecem_separados(self):
        """Fallback nao e erro: um e degradacao prevista, o outro e falha."""
        execucao(fallback_usado=True)
        execucao(status=StatusExecucao.ERRO, erro='timeout')

        dados = saude_da_plataforma()['ia']

        self.assertEqual(dados['fallbacks'], 1)
        self.assertEqual(dados['erros'], 1)

    def test_percentis_de_latencia_saem_das_execucoes(self):
        for latencia in (100, 200, 900):
            execucao(latencia_ms=latencia)

        dados = saude_da_plataforma()['ia']

        self.assertEqual(dados['p50_ms'], 200)
        self.assertEqual(dados['p90_ms'], 900)

    def test_sem_chave_o_provedor_aparece_como_nao_configurado(self):
        """A suite roda com a chave vazia por mandato (AGENTS.md 0.1)."""
        self.assertFalse(saude_da_plataforma()['ia']['provedor_configurado'])


class CartoesTests(SaudeBaseTests):
    def test_desempenho_traz_o_limite_de_tres_segundos(self):
        """Secao 6: a linha dos 3 s e critério de aceitacao, nao estimativa."""
        self.client.get(self.url())

        dados = saude_da_plataforma()['desempenho']

        self.assertEqual(dados['limite_ms'], 3000)
        self.assertGreaterEqual(dados['amostras'], 1)

    def test_desempenho_nao_traz_metrica_que_documento_nao_pede(self):
        """
        Poda de 16/10/2026 (plano 5.3).

        Uptime, ambiente, motor do banco e conexao reaproveitada sairam: nenhum
        documento de baseline os pede, e competiam com o consumo pela atencao.
        """
        dados = saude_da_plataforma()

        for campo in ('uptime_segundos', 'erros_servidor', 'requisicoes'):
            with self.subTest(campo=campo):
                self.assertNotIn(campo, dados['desempenho'])

        self.assertNotIn('processo', dados)
        self.assertEqual(set(dados['banco']), {'responde', 'erro'})

    def test_fila_nao_configurada_e_declarada_em_vez_de_zerada(self):
        """"0 jobs" se le como fila saudavel - e nao ha fila."""
        dados = saude_da_plataforma()['jobs']

        self.assertFalse(dados['configurado'])
        self.assertTrue(dados['motivo'])

    def test_banco_responde_sem_detalhe_de_motor(self):
        """Fica o que diz se o resto da pagina pode ser lido - nada alem."""
        dados = saude_da_plataforma()['banco']

        self.assertTrue(dados['responde'])
        self.assertEqual(dados['erro'], '')

    def test_bloco_de_ia_cobre_a_lista_de_observabilidade(self):
        """
        A lista e do documento, nao nossa.

        `Metodos_Integracao_IA.md`, secao Observabilidade: latencia, erros,
        tokens, custo, tamanho do contexto, modelo, versao de prompt e
        avaliacao humana.

        Aqui se verifica so que os oito **chegam a tela**. Que o custo seja de
        fato apurado - e nao uma chave com zero dentro - e `test_custo.py`:
        chave presente foi exatamente o que deixou a apuracao faltar sem a
        suite acusar.
        """
        execucao(versao_prompt='copiloto_v1')

        dados = saude_da_plataforma()['ia']

        for campo in (
            'p50_ms',
            'erros',
            'tokens_entrada',
            'tokens_saida',
            'custo_estimado_brl',
            'contexto_medio_tokens',
            'modelo',
            'revisao_humana',
        ):
            with self.subTest(campo=campo):
                self.assertIn(campo, dados)

        self.assertEqual(dados['ultima_execucao']['versao_prompt'], 'copiloto_v1')

    def test_tamanho_do_contexto_sai_dos_tokens_de_entrada(self):
        """O documento pede "tamanho do contexto"; o que o modelo grava e isso."""
        execucao(tokens_entrada=1000)
        execucao(tokens_entrada=2000)

        self.assertEqual(
            saude_da_plataforma()['ia']['contexto_medio_tokens'], 1500
        )

    def test_avaliacao_humana_conta_o_que_passou_por_gente(self):
        """AGENTS.md 0.2: a revisao humana tem de ser verificavel, nao prometida."""
        dados = saude_da_plataforma()['ia']['revisao_humana']

        self.assertEqual(dados['propostas_de_ia'], 0)
        self.assertEqual(dados['propostas_revisadas'], 0)
        self.assertEqual(dados['recomendacoes_acatadas'], 0)

    def test_cada_cartao_tem_o_proprio_campo_de_erro(self):
        """Falha de leitura nao derruba a pagina: a moldura fica de pe."""
        dados = saude_da_plataforma()

        for cartao in ('desempenho', 'ia', 'jobs', 'banco'):
            with self.subTest(cartao=cartao):
                self.assertIn(f'{cartao}_erro', dados)


class AcessoASaudeTests(SaudeBaseTests):
    def test_administrador_le_a_saude(self):
        self.assertEqual(self.client.get(self.url()).status_code, status.HTTP_200_OK)

    def test_supervisor_nao_le_a_saude(self):
        """O console e do Administrador (`CONTEXT.md` secao 3)."""
        self.client.force_authenticate(user=self.supervisor)

        self.assertEqual(
            self.client.get(self.url()).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_anonimo_nao_le_a_saude(self):
        self.client.force_authenticate(user=None)

        self.assertEqual(
            self.client.get(self.url()).status_code, status.HTTP_401_UNAUTHORIZED
        )


class EstadoDoConsumoTests(SaudeBaseTests):
    """
    A diferenca entre ausência de dado e consumo zero.

    Hoje nenhum código calcula `custo_estimado`: o gateway grava tokens e
    latência, e deixa o custo nulo. A tela precisa dizer isso, em vez de pintar
    "R$ 0,00 de R$ 50,00", que se le como gasto confirmado.
    """

    def test_sem_execucao_no_mes_o_estado_e_de_ausencia(self):
        self.assertEqual(saude_da_plataforma()['ia']['estado'], 'sem_execucao')

    def test_execucao_sem_custo_gravado_e_sem_apuracao(self):
        """O caso real de hoje: houve chamada, ninguém apurou custo."""
        execucao(custo_estimado=None)

        dados = saude_da_plataforma()['ia']

        self.assertEqual(dados['estado'], 'sem_apuracao')
        self.assertTrue(dados['houve_execucao'])
        self.assertFalse(dados['custo_apurado'])

    @override_settings(AI_CUSTO_TETO_MENSAL_BRL=50.0, AI_CUSTO_ALERTA_PERCENTUAL=80)
    def test_consumo_abaixo_do_alerta_e_normal(self):
        execucao(custo_estimado=Decimal('10.000000'))

        dados = saude_da_plataforma()['ia']

        self.assertEqual(dados['estado'], 'normal')
        self.assertTrue(dados['custo_apurado'])
        self.assertEqual(dados['saldo_brl'], 40.0)

    @override_settings(AI_CUSTO_TETO_MENSAL_BRL=50.0, AI_CUSTO_ALERTA_PERCENTUAL=80)
    def test_consumo_acima_do_alerta_pede_atencao(self):
        execucao(custo_estimado=Decimal('45.000000'))

        self.assertEqual(saude_da_plataforma()['ia']['estado'], 'atencao')

    @override_settings(AI_CUSTO_TETO_MENSAL_BRL=50.0)
    def test_consumo_acima_do_teto_e_excedido_e_o_saldo_nao_fica_negativo(self):
        execucao(custo_estimado=Decimal('60.000000'))

        dados = saude_da_plataforma()['ia']

        self.assertEqual(dados['estado'], 'excedido')
        self.assertEqual(dados['saldo_brl'], 0)
        self.assertGreater(dados['percentual_do_teto'], 100)

    def test_ultima_execucao_informa_a_versao_do_prompt(self):
        """`Metodos_Integracao_IA.md`: registrar modelo, prompt, versão e custo."""
        execucao(versao_prompt='copiloto_v1')

        self.assertEqual(
            saude_da_plataforma()['ia']['ultima_execucao']['versao_prompt'],
            'copiloto_v1',
        )

    def test_fila_ausente_nao_e_fila_esperada(self):
        """Sem fila configurada, a ausência e informação, nao alerta."""
        dados = saude_da_plataforma()['jobs']

        self.assertFalse(dados['configurado'])
        self.assertFalse(dados['esperada'])
