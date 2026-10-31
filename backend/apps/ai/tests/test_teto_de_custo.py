"""
O teto de gasto como Decorator sobre o provedor de IA (SPEC-04 e SPEC-23).

O teto morava dentro do adaptador do Gemini. Um provedor novo, ligado pela
configuracao, teria de lembrar de conferi-lo, e o teto e um so para todos os
provedores. Agora o registro entrega todo provedor embrulhado no teto: a mesma
interface, com a conferencia antes de cada chamada.
"""
import uuid
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.ai.models import ExecucaoIA, StatusExecucao, TipoExecucaoIA
from apps.ai.services import ProvedorGemini
from apps.ai.services.registro import (
    ProvedorRegistrado,
    desregistrar,
    provedor_com_reserva,
    provedor_principal,
    registrar,
)
from apps.ai.services.teto import ProvedorComTetoDeCusto
from core.tests.builders import OportunidadeBuilder, UsuarioBuilder


def gasto(**extra):
    registro = ExecucaoIA.objects.create(
        tipo=TipoExecucaoIA.COPILOTO,
        provedor='google',
        modelo='gemini-2.5-flash',
        status=StatusExecucao.OK,
        **extra,
    )
    ExecucaoIA.objects.filter(pk=registro.pk).update(criado_em=timezone.now())
    return registro


class ProvedorQueConta:
    """Responde sempre e anota cada operacao chamada."""

    modelo = 'modelo-de-teste'

    def __init__(self, *, disponivel=True, chamadas=None, **kwargs):
        self.disponivel = disponivel
        self.chamadas = chamadas if chamadas is not None else []

    def _responder(self, operacao):
        self.chamadas.append(operacao)
        return {
            'dados': {'respondeu': operacao},
            'execucao_ia': None,
            'fallback_usado': not self.disponivel,
            'motivo_fallback': None if self.disponivel else 'ia_indisponivel',
        }

    def sintetizar_entrada(self, **kwargs):
        return self._responder('sintetizar_entrada')

    def estruturar_proposta(self, **kwargs):
        return self._responder('estruturar_proposta')

    def derivar_competencias(self, **kwargs):
        return self._responder('derivar_competencias')

    def executar_matching(self, **kwargs):
        return self._responder('executar_matching')

    def pre_analise_pipe(self, **kwargs):
        return self._responder('pre_analise_pipe')


@override_settings(AI_CUSTO_TETO_MENSAL_BRL=50.0, AI_CUSTO_TETO_POR_OPORTUNIDADE_BRL=5.0)
class TetoDeCustoTests(TestCase):
    def setUp(self):
        supervisor = UsuarioBuilder().supervisor().build()
        self.oportunidade = OportunidadeBuilder().interna().criada_por(supervisor).build()
        self.provedor = ProvedorQueConta()
        self.com_teto = ProvedorComTetoDeCusto(self.provedor)

    def chamar(self, operacao='derivar_competencias'):
        return getattr(self.com_teto, operacao)(
            oportunidade_id=self.oportunidade.id_oportunidade,
            correlation_id=uuid.uuid4(),
            executado_por='supervisor@ac2microbiologia.com.br',
        )

    def test_abaixo_do_teto_a_chamada_segue(self):
        gasto(oportunidade=self.oportunidade, custo_estimado=Decimal('4.00'))

        resultado = self.chamar()

        self.assertEqual(self.provedor.chamadas, ['derivar_competencias'])
        self.assertFalse(resultado['fallback_usado'])

    def test_no_limite_da_oportunidade_a_chamada_nao_sai(self):
        gasto(oportunidade=self.oportunidade, custo_estimado=Decimal('5.00'))
        execucoes = ExecucaoIA.objects.count()

        resultado = self.chamar()

        self.assertEqual(self.provedor.chamadas, [])
        self.assertTrue(resultado['fallback_usado'])
        self.assertEqual(resultado['motivo_fallback'], 'limite_da_oportunidade')
        self.assertEqual(resultado['dados'], {'competencias': []})
        self.assertIsNone(resultado['execucao_ia'])
        self.assertEqual(ExecucaoIA.objects.count(), execucoes)

    @override_settings(AI_CUSTO_TETO_MENSAL_BRL=1.0, AI_CUSTO_TETO_POR_OPORTUNIDADE_BRL=0)
    def test_no_teto_do_mes_a_resposta_diz_o_motivo_e_mantem_a_forma(self):
        gasto(custo_estimado=Decimal('2.00'))

        resultado = self.chamar('pre_analise_pipe')

        self.assertEqual(resultado['motivo_fallback'], 'limite_do_mes')
        self.assertEqual(
            set(resultado['dados']), {'dimensoes', 'lacunas', 'recomendacoes', 'sintese'}
        )

    def test_cada_operacao_passa_pelo_teto(self):
        gasto(oportunidade=self.oportunidade, custo_estimado=Decimal('5.00'))

        for operacao in (
            'sintetizar_entrada',
            'estruturar_proposta',
            'derivar_competencias',
            'executar_matching',
            'pre_analise_pipe',
        ):
            self.assertEqual(self.chamar(operacao)['motivo_fallback'], 'limite_da_oportunidade')

        self.assertEqual(self.provedor.chamadas, [])

    def test_provedor_indisponivel_responde_por_si(self):
        gasto(oportunidade=self.oportunidade, custo_estimado=Decimal('5.00'))
        provedor = ProvedorQueConta(disponivel=False)

        resultado = ProvedorComTetoDeCusto(provedor).derivar_competencias(
            oportunidade_id=self.oportunidade.id_oportunidade
        )

        self.assertEqual(resultado['motivo_fallback'], 'ia_indisponivel')

    def test_o_resto_da_interface_vem_do_provedor_decorado(self):
        self.assertEqual(self.com_teto.modelo, 'modelo-de-teste')
        self.assertTrue(self.com_teto.disponivel)
        self.assertIs(self.com_teto.decorado, self.provedor)


@override_settings(
    AI_CUSTO_TETO_MENSAL_BRL=1.0,
    AI_CUSTO_TETO_POR_OPORTUNIDADE_BRL=0,
    AI_PROVEDOR_PRINCIPAL='fake_com_teto',
    AI_PROVEDOR_RESERVA='',
    AI_MODELO_RESERVA='',
)
class RegistroEntregaOProvedorComTetoTests(TestCase):
    """Todo provedor que sai do registro passa pelo teto, inclusive um novo."""

    def setUp(self):
        self.chamadas = []
        registrar(
            ProvedorRegistrado(
                nome='fake_com_teto',
                rotulo='Provedor de teste',
                fabrica=lambda **kwargs: ProvedorQueConta(chamadas=self.chamadas, **kwargs),
                chave_setting='GEMINI_API_KEY',
                modelo_setting='AI_MATCH_GEMINI_MODEL',
                preco_entrada_setting='AI_CUSTO_ENTRADA_BRL_POR_MILHAO',
                preco_saida_setting='AI_CUSTO_SAIDA_BRL_POR_MILHAO',
            )
        )
        gasto(custo_estimado=Decimal('2.00'))

    def tearDown(self):
        desregistrar('fake_com_teto')

    def test_o_principal_vem_com_o_teto(self):
        resultado = provedor_principal().derivar_competencias(oportunidade_id=None)

        self.assertEqual(resultado['motivo_fallback'], 'limite_do_mes')
        self.assertEqual(self.chamadas, [])

    def test_o_principal_com_reserva_vem_com_o_teto(self):
        resultado = provedor_com_reserva().derivar_competencias(oportunidade_id=None)

        self.assertEqual(resultado['motivo_fallback'], 'limite_do_mes')
        self.assertEqual(self.chamadas, [])


@override_settings(AI_CUSTO_TETO_MENSAL_BRL=1.0, AI_CUSTO_TETO_POR_OPORTUNIDADE_BRL=0)
class AdaptadorSemTetoProprioTests(TestCase):
    """O teto fica num lugar só: o adaptador do Gemini não confere de novo."""

    def test_o_adaptador_chama_o_cliente_e_o_teto_fica_no_decorator(self):
        gasto(custo_estimado=Decimal('2.00'))

        class Resposta:
            text = '{"competencias": []}'
            usage_metadata = None

        class ClienteQueResponde:
            chamadas = 0

            def generate_content(self, *args, **kwargs):
                ClienteQueResponde.chamadas += 1
                return Resposta()

        ProvedorGemini(cliente=ClienteQueResponde(), dormir=lambda _s: None).derivar_competencias(
            oportunidade_id=None,
            proposta_texto='Deteccao rapida de contaminacao.',
            correlation_id=uuid.uuid4(),
            executado_por='supervisor@ac2microbiologia.com.br',
        )

        self.assertEqual(ClienteQueResponde.chamadas, 1)
