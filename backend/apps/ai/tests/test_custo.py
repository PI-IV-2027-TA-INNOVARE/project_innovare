"""
Apuracao de custo e teto de gasto.

A exigencia nao e nossa: `docs/Engenharia_IA/Plano_Integracao_IA.md`, secao
Controle de custo, manda cada chamada registrar "tokens de entrada e saida,
modelo, fluxo e custo estimado", e lista "custo e latencia ficam visiveis para
a equipe" entre os criterios de aceite. `Metodos_Integracao_IA.md`, na tabela
de falhas, define o comportamento no estouro: "Custo acima do limite ->
Interromper requisicao e registrar alerta".

Nenhum teste abre socket: sem `GEMINI_API_KEY` o provedor nasce indisponivel
(AGENTS.md 0.1), e o calculo e exercitado como funcao pura.
"""
import uuid
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.ai.models import ExecucaoIA, StatusExecucao, TipoExecucaoIA
from apps.ai.services.custo import (
    TetoDeCustoExcedido,
    custo_da_chamada,
    custo_do_mes,
    garantir_orcamento,
)
from apps.ai.services.saude import saude_da_plataforma


def execucao(**extra):
    base = {
        'tipo': TipoExecucaoIA.COPILOTO,
        'provedor': 'google',
        'modelo': 'gemini-2.5-flash',
        'status': StatusExecucao.OK,
        'criado_em': timezone.now(),
    }
    base.update(extra)

    registro = ExecucaoIA.objects.create(
        **{k: v for k, v in base.items() if k != 'criado_em'}
    )
    ExecucaoIA.objects.filter(pk=registro.pk).update(criado_em=base['criado_em'])

    return registro


@override_settings(
    AI_CUSTO_ENTRADA_BRL_POR_MILHAO=1.0,
    AI_CUSTO_SAIDA_BRL_POR_MILHAO=4.0,
)
class CustoDaChamadaTests(TestCase):
    """A formula e a do documento, nao uma invencao do codigo."""

    def test_aplica_a_formula_do_documento(self):
        self.assertAlmostEqual(
            custo_da_chamada(tokens_entrada=1_000_000, tokens_saida=1_000_000),
            5.0,
        )

    def test_entrada_e_saida_tem_precos_diferentes(self):
        self.assertAlmostEqual(
            custo_da_chamada(tokens_entrada=1_000_000, tokens_saida=0), 1.0
        )
        self.assertAlmostEqual(
            custo_da_chamada(tokens_entrada=0, tokens_saida=1_000_000), 4.0
        )

    def test_chamada_sem_token_medido_nao_vira_custo_zero(self):
        """
        Zero afirma gasto apurado. `None` diz que ninguem mediu - e a tela ja
        sabe pintar a diferenca (`sem_apuracao`).
        """
        self.assertIsNone(
            custo_da_chamada(tokens_entrada=None, tokens_saida=None)
        )

    def test_um_lado_medido_basta_para_apurar(self):
        self.assertAlmostEqual(
            custo_da_chamada(tokens_entrada=500_000, tokens_saida=None), 0.5
        )


@override_settings(
    AI_CUSTO_ENTRADA_BRL_POR_MILHAO=1.0,
    AI_CUSTO_SAIDA_BRL_POR_MILHAO=4.0,
    AI_CUSTO_TETO_MENSAL_BRL=10.0,
)
class TetoMensalTests(TestCase):
    def test_custo_do_mes_soma_so_o_mes_corrente(self):
        execucao(custo_estimado=Decimal('3.00'))
        execucao(
            custo_estimado=Decimal('99.00'),
            criado_em=timezone.now() - timezone.timedelta(days=45),
        )

        self.assertAlmostEqual(custo_do_mes(), 3.0)

    def test_abaixo_do_teto_a_chamada_segue(self):
        execucao(custo_estimado=Decimal('3.00'))

        garantir_orcamento()

    def test_no_teto_a_chamada_e_interrompida(self):
        execucao(custo_estimado=Decimal('10.00'))

        with self.assertRaises(TetoDeCustoExcedido):
            garantir_orcamento()

    def test_o_alerta_do_estouro_fica_na_trilha(self):
        from apps.audit.models import EventoAuditoria

        execucao(custo_estimado=Decimal('12.00'))

        with self.assertRaises(TetoDeCustoExcedido):
            garantir_orcamento()

        evento = EventoAuditoria.objects.get(tipo='teto_de_custo_excedido')
        self.assertEqual(evento.categoria, 'config')
        self.assertEqual(evento.status, 'negado')

    @override_settings(AI_CUSTO_TETO_MENSAL_BRL=0)
    def test_teto_zerado_nao_interrompe_nada(self):
        """Teto 0 e 'sem teto configurado', nao 'tudo proibido'."""
        execucao(custo_estimado=Decimal('999.00'))

        garantir_orcamento()


@override_settings(
    AI_CUSTO_ENTRADA_BRL_POR_MILHAO=1.0,
    AI_CUSTO_SAIDA_BRL_POR_MILHAO=4.0,
    AI_CUSTO_TETO_MENSAL_BRL=10.0,
)
class CustoNaTelaDeSaudeTests(TestCase):
    """O criterio de aceite: custo visivel para a equipe."""

    def test_execucao_com_custo_apurado_sai_do_estado_sem_apuracao(self):
        execucao(
            tokens_entrada=1_000_000,
            tokens_saida=250_000,
            custo_estimado=Decimal('2.00'),
        )

        ia = saude_da_plataforma()['ia']

        self.assertTrue(ia['custo_apurado'])
        self.assertEqual(ia['estado'], 'normal')
        self.assertAlmostEqual(ia['custo_estimado_brl'], 2.0)
        self.assertAlmostEqual(ia['percentual_do_teto'], 20.0)

    def test_o_preco_usado_na_apuracao_fica_visivel(self):
        """
        Sem a regua, o numero nao se interpreta - e a mesma razao pela qual o
        relatorio de equipe mostra os pesos da rodada.
        """
        ia = saude_da_plataforma()['ia']

        self.assertAlmostEqual(ia['preco_entrada_brl_por_milhao'], 1.0)
        self.assertAlmostEqual(ia['preco_saida_brl_por_milhao'], 4.0)


class ProvedorApuraCustoTests(TestCase):
    """
    O gateway grava o custo junto com os tokens.

    Sem chave o caminho do provedor nem roda; o que se verifica aqui e que a
    finalizacao da execucao apura o custo a partir dos tokens medidos.
    """

    @override_settings(
        GEMINI_API_KEY='',
        AI_CUSTO_ENTRADA_BRL_POR_MILHAO=1.0,
        AI_CUSTO_SAIDA_BRL_POR_MILHAO=4.0,
    )
    def test_finalizar_execucao_apura_o_custo_dos_tokens(self):
        from apps.ai.services import ProvedorGemini

        provedor = ProvedorGemini()
        registro = ExecucaoIA.objects.create(
            tipo=TipoExecucaoIA.COPILOTO,
            provedor='google',
            modelo='gemini-2.5-flash',
            correlation_id=uuid.uuid4(),
            status=StatusExecucao.EXECUTANDO,
        )

        provedor._finalizar_execucao(
            execucao=registro,
            status=StatusExecucao.OK,
            tokens_entrada=1_000_000,
            tokens_saida=500_000,
            latencia_ms=120,
        )

        registro.refresh_from_db()
        self.assertAlmostEqual(float(registro.custo_estimado), 3.0)


class ContagemDeTokensTests(TestCase):
    """
    O documento manda *registrar* tokens, nao estima-los.

    `len(prompt) // 4` e chute de caractere: erra por idioma, por acento e por
    tokenizador, e e sobre ele que a fatura seria conferida. Quando o provedor
    devolve `usage_metadata`, e ele que vale; a estimativa fica so para quando
    o provedor nao informa.
    """

    def test_usa_o_usage_metadata_do_provedor_quando_existe(self):
        from apps.ai.services.gemini_service import tokens_da_resposta

        class Uso:
            prompt_token_count = 1234
            candidates_token_count = 567

        class Resposta:
            usage_metadata = Uso()
            text = 'x' * 40

        self.assertEqual(
            tokens_da_resposta(Resposta(), prompt='y' * 400), (1234, 567)
        )

    def test_sem_usage_metadata_cai_na_estimativa_por_caractere(self):
        from apps.ai.services.gemini_service import tokens_da_resposta

        class Resposta:
            usage_metadata = None
            text = 'x' * 40

        self.assertEqual(
            tokens_da_resposta(Resposta(), prompt='y' * 400), (100, 10)
        )

    def test_resposta_vazia_nao_quebra_a_contagem(self):
        from apps.ai.services.gemini_service import tokens_da_resposta

        class Resposta:
            usage_metadata = None
            text = None

        self.assertEqual(tokens_da_resposta(Resposta(), prompt='y' * 400), (100, 0))


@override_settings(
    AI_CUSTO_ENTRADA_BRL_POR_MILHAO=1.0,
    AI_CUSTO_SAIDA_BRL_POR_MILHAO=4.0,
    AI_CUSTO_TETO_MENSAL_BRL=50.0,
)
class CustoPorFluxoTests(TestCase):
    """
    "tokens por requisicao, custo estimado **por fluxo** e custo mensal"
    (Plano_de_execucao_IA_PD_Connect.md, Criterios de avaliacao).

    O total do mes nao responde onde cortar gasto; o corte por operacao, sim.
    """

    def test_custo_sai_separado_por_operacao(self):
        execucao(tipo=TipoExecucaoIA.COPILOTO, custo_estimado=Decimal('3.00'))
        execucao(tipo=TipoExecucaoIA.COPILOTO, custo_estimado=Decimal('1.50'))
        execucao(tipo=TipoExecucaoIA.MATCHING, custo_estimado=Decimal('0.25'))

        por_tipo = saude_da_plataforma()['ia']['custo_por_tipo']

        self.assertAlmostEqual(por_tipo['copiloto'], 4.5)
        self.assertAlmostEqual(por_tipo['matching'], 0.25)

    def test_operacao_sem_custo_apurado_nao_vira_zero(self):
        execucao(tipo=TipoExecucaoIA.PREANALISE, custo_estimado=None)

        por_tipo = saude_da_plataforma()['ia']['custo_por_tipo']

        self.assertNotIn('preanalise', por_tipo)


class ExecucaoVinculadaAOportunidadeTests(TestCase):
    """
    `ExecucaoIA.oportunidade` - a FK que faltava.

    Sem ela nao ha como responder "quanto esta oportunidade custou", que e o
    "limite por oportunidade" de `Plano_Integracao_IA.md` (secao Controle de
    custo). O gateway ja recebia `oportunidade_id` nos quatro fluxos e o
    descartava.

    Anulavel e `SET_NULL` pelo mesmo motivo de `historico_evento`: execucao de
    embedding nao tem oportunidade, e apagar a oportunidade nao pode apagar o
    gasto do mes - o teto e apurado sobre esta tabela.
    """

    def setUp(self):
        from apps.organizations.models import Organizacao, TipoOrganizacao
        from apps.opportunities.models import Oportunidade, OrigemOportunidade

        self.organizacao = Organizacao.objects.create(
            tipo=TipoOrganizacao.DEMANDANTE,
            nome='Agroindustria Vale Verde',
            cnpj='12345678000199',
        )
        self.oportunidade = Oportunidade.objects.create(
            codigo='OP-2026-001',
            titulo='Contaminacao na linha de envase',
            origem=OrigemOportunidade.EXTERNO,
            demandante=self.organizacao,
        )

    def test_execucao_guarda_a_oportunidade_que_a_motivou(self):
        registro = execucao(oportunidade=self.oportunidade)

        registro.refresh_from_db()
        self.assertEqual(
            registro.oportunidade_id, self.oportunidade.id_oportunidade
        )

    def test_execucao_sem_oportunidade_continua_valida(self):
        """Embedding da rede inteira nao pende de oportunidade nenhuma."""
        registro = execucao(tipo=TipoExecucaoIA.EMBEDDING)

        registro.refresh_from_db()
        self.assertIsNone(registro.oportunidade_id)

    def test_apagar_a_oportunidade_nao_apaga_o_gasto(self):
        execucao(
            oportunidade=self.oportunidade, custo_estimado=Decimal('2.00')
        )

        self.oportunidade.delete()

        sobrevivente = ExecucaoIA.objects.get()
        self.assertIsNone(sobrevivente.oportunidade_id)
        self.assertEqual(sobrevivente.custo_estimado, Decimal('2.00'))

    @override_settings(GEMINI_API_KEY='')
    def test_o_gateway_grava_a_oportunidade_em_vez_de_descartar(self):
        from apps.ai.services import ProvedorGemini

        registro = ProvedorGemini()._criar_execucao(
            tipo=TipoExecucaoIA.COPILOTO,
            oportunidade_id=self.oportunidade.id_oportunidade,
            correlation_id=uuid.uuid4(),
            prompt_versao='copiloto_v1',
            parametros={},
        )

        registro.refresh_from_db()
        self.assertEqual(
            registro.oportunidade_id, self.oportunidade.id_oportunidade
        )
