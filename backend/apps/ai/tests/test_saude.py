"""
Testes da pagina de Saude e consumo de IA (plano 5.2).

As duas restricoes que a tela transforma em evidencia: **3 s** por operacao
convencional (`CONTEXT.md` secao 6) e o teto de **~R$ 50/mes** (secao 2).

O que esta sob prova: o recorte por mes de calendario (o teto e mensal), a
ausencia declarada em vez de zero enganoso, e o portao do Administrador.
"""
import uuid
from decimal import Decimal
from unittest.mock import patch

from django.http import HttpResponse
from django.test import RequestFactory, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import ExecucaoIA, StatusExecucao, TipoExecucaoIA
from apps.ai.services.gemini_service import ProvedorGemini
from apps.ai.services.registro import ProvedorRegistrado, desregistrar, registrar
from apps.ai.services.saude import inicio_do_mes, saude_da_plataforma
from apps.ai.tests.test_provedor import RespostaFalsa
from apps.matching.models import ExecucaoMatching
from core.medicao import (
    MedidorDeRequisicoes,
    espera_de_ia,
    espera_de_ia_ms,
    medidor,
    zerar_espera_de_ia,
)
from core.middleware import MedidorDeDesempenho
from core.tests.builders import OportunidadeBuilder, UsuarioBuilder


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


SEM_RESERVA = {
    'AI_PROVEDOR_PRINCIPAL': 'google',
    'AI_PROVEDOR_RESERVA': '',
    'AI_MODELO_RESERVA': '',
    'AI_MATCH_GEMINI_MODEL': 'gemini-2.5-flash',
}


def registrar_falso(nome, rotulo):
    registrar(
        ProvedorRegistrado(
            nome=nome,
            rotulo=rotulo,
            fabrica=lambda **kwargs: None,
            chave_setting='CHAVE_DO_TESTE_INEXISTENTE',
            modelo_setting='MODELO_DO_TESTE_INEXISTENTE',
            preco_entrada_setting='PRECO_DO_TESTE_INEXISTENTE',
            preco_saida_setting='PRECO_DO_TESTE_INEXISTENTE',
        )
    )


@override_settings(**SEM_RESERVA)
class ProvedoresNaAPITests(SaudeBaseTests):
    def test_api_expoe_uma_linha_por_provedor(self):
        """O contrato que a tela consome: a lista nao fica so no servico."""
        resposta = self.client.get(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        provedores = resposta.data['ia']['provedores']
        self.assertEqual([item['nome'] for item in provedores], ['google'])
        self.assertEqual(provedores[0]['papel'], 'principal')
        self.assertEqual(provedores[0]['modelo'], 'gemini-2.5-flash')
        self.assertIn('falhas', provedores[0])
        self.assertIn('falhas', resposta.data['ia'])


@override_settings(**SEM_RESERVA)
class ProvedoresPorModeloTests(SaudeBaseTests):
    """
    Uma linha por provedor e modelo, porque a reserva pode ser o mesmo
    provedor com outro modelo: agrupar so pelo provedor juntava os dois e
    mostrava apenas o modelo principal.
    """

    def tearDown(self):
        for nome in ('fake_primeiro', 'fake_outro'):
            desregistrar(nome)

    def linhas(self):
        return [
            (item['nome'], item['modelo'], item['papel'])
            for item in saude_da_plataforma()['ia']['provedores']
        ]

    @override_settings(AI_MODELO_RESERVA='gemini-2.5-pro')
    def test_modelo_de_reserva_do_mesmo_provedor_ganha_linha_propria(self):
        execucao(status=StatusExecucao.ERRO, erro='timeout')
        execucao(modelo='gemini-2.5-pro')

        provedores = saude_da_plataforma()['ia']['provedores']

        self.assertEqual(
            [(item['modelo'], item['papel'], item['chamadas'], item['falhas']) for item in provedores],
            [('gemini-2.5-flash', 'principal', 1, 1), ('gemini-2.5-pro', 'reserva', 1, 0)],
        )

    def test_modelo_usado_no_mes_e_fora_da_configuracao_fica_fora_de_uso(self):
        execucao(modelo='gemini-1.5-flash')

        self.assertEqual(
            self.linhas(),
            [
                ('google', 'gemini-2.5-flash', 'principal'),
                ('google', 'gemini-1.5-flash', 'fora_de_uso'),
            ],
        )

    def test_provedor_que_saiu_do_registro_continua_na_conta_do_mes(self):
        """Sem a linha dele, a soma das linhas nao bate com o total do mes."""
        execucao(provedor='antigo', modelo='modelo-antigo')

        antigo = saude_da_plataforma()['ia']['provedores'][-1]

        self.assertEqual(antigo['nome'], 'antigo')
        self.assertEqual(antigo['rotulo'], 'antigo')
        self.assertEqual(antigo['papel'], 'fora_de_uso')
        self.assertFalse(antigo['configurado'])
        self.assertEqual(antigo['chamadas'], 1)

    @override_settings(AI_PROVEDOR_PRINCIPAL='fake_primeiro', AI_PROVEDOR_RESERVA='google')
    def test_principal_vem_primeiro_depois_a_reserva_e_por_fim_os_demais(self):
        registrar_falso('fake_outro', 'Outro')
        registrar_falso('fake_primeiro', 'Primeiro')

        self.assertEqual(
            self.linhas(),
            [
                ('fake_primeiro', '', 'principal'),
                ('google', 'gemini-2.5-flash', 'reserva'),
                ('fake_outro', '', 'sem_uso'),
            ],
        )

    def test_o_modelo_da_propria_plataforma_fica_fora_do_consumo_e_dos_provedores(self):
        """
        A comparacao com a rede roda num modelo no proprio servidor, sem
        provedor nem custo. Ela tem cartao proprio; no consumo, caia como
        provedor fora de uso e como "ultimo uso" que ninguem entendia.
        """
        execucao()
        execucao(
            tipo=TipoExecucaoIA.EMBEDDING,
            provedor='sentence-transformers',
            modelo='paraphrase-multilingual-MiniLM-L12-v2',
            custo_estimado=None,
        )

        dados = saude_da_plataforma()['ia']

        self.assertEqual(dados['chamadas'], 1)
        self.assertNotIn(TipoExecucaoIA.EMBEDDING, dados['por_tipo'])
        self.assertEqual([item['nome'] for item in dados['provedores']], ['google'])
        self.assertEqual(dados['ultima_execucao']['tipo'], TipoExecucaoIA.COPILOTO)

    def test_mes_so_com_o_modelo_local_nao_pede_preco_de_provedor(self):
        """Sem isso, a tela dizia "falta configurar o preco" de algo que nao cobra."""
        execucao(
            tipo=TipoExecucaoIA.EMBEDDING,
            provedor='sentence-transformers',
            modelo='paraphrase-multilingual-MiniLM-L12-v2',
            custo_estimado=None,
        )

        self.assertEqual(saude_da_plataforma()['ia']['estado'], 'sem_execucao')

    def test_reserva_identica_ao_principal_nao_e_reserva(self):
        with override_settings(AI_MODELO_RESERVA='gemini-2.5-flash'):
            self.assertEqual(self.linhas(), [('google', 'gemini-2.5-flash', 'principal')])

    def test_falha_conta_cada_uso_uma_vez(self):
        """Erro que tambem seguiu sem IA e uma falha, nao duas."""
        execucao(status=StatusExecucao.ERRO, fallback_usado=True)
        execucao(fallback_usado=True)
        execucao()

        dados = saude_da_plataforma()['ia']

        self.assertEqual(dados['falhas'], 2)
        self.assertEqual(dados['provedores'][0]['falhas'], 2)

    @override_settings(AI_CUSTO_ENTRADA_BRL_POR_MILHAO=1.5, AI_CUSTO_SAIDA_BRL_POR_MILHAO=6.0)
    def test_cada_linha_traz_o_preco_do_proprio_provedor(self):
        registrar_falso('fake_outro', 'Outro')
        execucao(provedor='fake_outro', modelo='m', custo_estimado=None)

        precos = {
            item['nome']: (item['preco_entrada_brl_por_milhao'], item['preco_saida_brl_por_milhao'])
            for item in saude_da_plataforma()['ia']['provedores']
        }

        self.assertEqual(precos, {'google': (1.5, 6.0), 'fake_outro': (0.0, 0.0)})


class RelogioFalso:
    def __init__(self):
        self.agora = 0.0

    def __call__(self):
        return self.agora


class MedidaSemAEsperaDaIATests(TestCase):
    """
    `CONTEXT.md` secao 6: operacoes convencionais em ate 3 s, "desconsiderando
    servicos externos de IA". A medida contava a espera pelo Gemini, e uma
    estruturacao de 20 s pintava a plataforma inteira de lenta.
    """

    def setUp(self):
        medidor().zerar()
        self.relogio = RelogioFalso()

    def test_o_middleware_desconta_a_espera_pela_ia(self):
        def resposta(_request):
            self.relogio.agora += 1
            with espera_de_ia():
                self.relogio.agora += 4
            self.relogio.agora += 1
            return HttpResponse()

        with patch('time.perf_counter', self.relogio):
            MedidorDeDesempenho(resposta)(RequestFactory().get('/api/qualquer/'))

        self.assertEqual(medidor().resumo(limite_ms=3000)['p50_ms'], 2000)

    def test_a_espera_de_uma_requisicao_nao_vaza_para_a_seguinte(self):
        def com_ia(_request):
            with espera_de_ia():
                self.relogio.agora += 4
            return HttpResponse()

        def sem_ia(_request):
            self.relogio.agora += 1
            return HttpResponse()

        with patch('time.perf_counter', self.relogio):
            MedidorDeDesempenho(com_ia)(RequestFactory().get('/api/a/'))
            MedidorDeDesempenho(sem_ia)(RequestFactory().get('/api/b/'))

        self.assertEqual(medidor().resumo(limite_ms=3000)['p90_ms'], 1000)

    def test_a_chamada_ao_gemini_conta_como_espera_pela_ia(self):
        relogio = self.relogio

        class ClienteQueDemora:
            def generate_content(self, prompt, **kwargs):
                relogio.agora += 4
                return RespostaFalsa()

        provedor = ProvedorGemini(cliente=ClienteQueDemora(), dormir=lambda _s: None)
        zerar_espera_de_ia()

        with patch('time.perf_counter', self.relogio):
            provedor.derivar_competencias(
                oportunidade_id=None,
                proposta_texto='Deteccao rapida de contaminacao.',
                correlation_id=uuid.uuid4(),
                executado_por='supervisor@ac2microbiologia.com.br',
            )

        self.assertEqual(espera_de_ia_ms(), 4000)

    def test_as_acoes_acima_do_limite_sao_contadas_na_janela_dos_percentis(self):
        """"Medido em 500 acoes" e "N acima do limite" tem de falar das mesmas acoes."""
        medicao = MedidorDeRequisicoes(capacidade=3)

        for duracao in (5000, 100, 100, 100):
            medicao.registrar(duracao_ms=duracao, status=200)

        resumo = medicao.resumo(limite_ms=3000)

        self.assertEqual(resumo['amostras'], 3)
        self.assertEqual(resumo['acima_do_limite'], 0)


class ComparacaoComARedeTests(SaudeBaseTests):
    """
    O MiniLM que roda no proprio servidor e da a afinidade com o tema, 45% da
    nota do matching. Nao e provedor nem cobra; o que importa a quem
    administra e se as rodadas de matching estao recebendo a afinidade.
    """

    def rodada(self, *, sem_afinidade=False, iniciada_em=None):
        rodada = ExecucaoMatching.objects.create(
            oportunidade=self.oportunidade,
            estrategia='hibrido_v1',
            executado_por=self.supervisor.email,
            status=StatusExecucao.OK,
            fallback_usado=sem_afinidade,
        )

        if iniciada_em:
            ExecucaoMatching.objects.filter(pk=rodada.pk).update(iniciado_em=iniciada_em)

        return rodada

    def setUp(self):
        super().setUp()
        self.oportunidade = OportunidadeBuilder().interna().criada_por(self.supervisor).build()

    @override_settings(SEARCH_EMBEDDING_ENABLED=True, AI_MATCH_WEIGHT_SEMANTIC=0.45)
    def test_conta_as_rodadas_do_mes_que_sairam_sem_a_afinidade(self):
        self.rodada()
        self.rodada(sem_afinidade=True)
        self.rodada(sem_afinidade=True, iniciada_em=inicio_do_mes() - timezone.timedelta(days=1))

        dados = saude_da_plataforma()['comparacao']

        self.assertTrue(dados['ligada'])
        self.assertEqual(dados['rodadas_no_mes'], 2)
        self.assertEqual(dados['rodadas_sem_afinidade'], 1)
        self.assertEqual(dados['peso_na_nota'], 0.45)

    @override_settings(SEARCH_EMBEDDING_ENABLED=False)
    def test_desligada_e_declarada(self):
        self.assertFalse(saude_da_plataforma()['comparacao']['ligada'])

    def test_o_ultimo_calculo_sai_das_execucoes_do_modelo_local(self):
        calculo = execucao(
            tipo=TipoExecucaoIA.EMBEDDING,
            provedor='sentence-transformers',
            modelo='paraphrase-multilingual-MiniLM-L12-v2',
            custo_estimado=None,
        )
        execucao()

        self.assertEqual(saude_da_plataforma()['comparacao']['ultimo_calculo'], calculo.criado_em)

    def test_a_api_entrega_o_bloco_com_o_proprio_campo_de_erro(self):
        resposta = self.client.get(self.url())

        self.assertIn('rodadas_sem_afinidade', resposta.data['comparacao'])
        self.assertEqual(resposta.data['comparacao_erro'], '')


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

        for cartao in ('desempenho', 'ia', 'comparacao', 'jobs', 'banco'):
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
