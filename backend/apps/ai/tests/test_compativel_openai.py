"""
Provedores compativeis com a API da OpenAI (SPEC-23).

Groq, OpenRouter e os demais que aceitam `POST /chat/completions` entram pelo
catalogo do `.env`. O adaptador e um so; o que muda de um para outro e o
endereco, a chave e o modelo.

Nenhum teste abre socket: o transporte do `httpx` e trocado por um falso, que
responde o que o teste pedir (AGENTS.md 0.1).
"""
import json
import uuid

import httpx
from django.test import TestCase, override_settings

from apps.ai.models import ExecucaoIA, StatusExecucao
from apps.ai.services.compativel_openai import (
    ClienteCompativelComOpenAI,
    ProvedorCompativelComOpenAI,
    RespostaForaDoContrato,
    ler_resposta,
)
from apps.ai.services.gemini_service import falha_passageira

CATALOGO_GROQ = {
    'AI_PROVEDORES_COMPATIVEIS': ['groq'],
    'GROQ_API_KEY': 'chave-de-teste',
    'AI_GROQ_URL': 'https://api.exemplo.test/openai/v1',
    'AI_GROQ_MODELO': 'modelo-de-teste',
    'AI_GEMINI_TENTATIVAS': 2,
    'AI_GEMINI_TIMEOUT_S': 30,
    'AI_GEMINI_MAX_TOKENS_SAIDA': 4096,
}


def corpo_ok(texto='{"competencias": []}', entrada=120, saida=30):
    return {
        'choices': [{'message': {'role': 'assistant', 'content': texto}}],
        'usage': {'prompt_tokens': entrada, 'completion_tokens': saida},
    }


class TransporteFalso(httpx.BaseTransport):
    """Responde, na ordem, o que o teste deu: corpo JSON com status, ou excecao."""

    def __init__(self, *respostas):
        self._respostas = list(respostas)
        self.pedidos = []

    def handle_request(self, request):
        self.pedidos.append(request)
        resposta = self._respostas.pop(0)

        if isinstance(resposta, Exception):
            raise resposta

        status, corpo = resposta
        return httpx.Response(status, json=corpo, request=request)


def provedor_groq(transporte, **kwargs):
    return ProvedorCompativelComOpenAI(
        nome='groq',
        chave_setting='GROQ_API_KEY',
        modelo_setting='AI_GROQ_MODELO',
        url_setting='AI_GROQ_URL',
        transporte=transporte,
        dormir=lambda _segundos: None,
        **kwargs,
    )


def derivar(provedor):
    return provedor.derivar_competencias(
        oportunidade_id=None,
        proposta_texto='Deteccao rapida de contaminacao.',
        correlation_id=uuid.uuid4(),
        executado_por='supervisor@ac2microbiologia.com.br',
    )


@override_settings(**CATALOGO_GROQ)
class PedidoAoProvedorTests(TestCase):
    def test_o_pedido_vai_ao_endereco_do_env_com_a_chave_e_o_modelo(self):
        transporte = TransporteFalso((200, corpo_ok()))

        derivar(provedor_groq(transporte))

        pedido = transporte.pedidos[0]
        corpo = json.loads(pedido.content)
        self.assertEqual(
            str(pedido.url), 'https://api.exemplo.test/openai/v1/chat/completions'
        )
        self.assertEqual(pedido.headers['Authorization'], 'Bearer chave-de-teste')
        self.assertEqual(corpo['model'], 'modelo-de-teste')
        self.assertEqual(corpo['max_tokens'], 4096)
        self.assertEqual(corpo['response_format'], {'type': 'json_object'})

    def test_o_prompt_de_sistema_vai_antes_do_pedido(self):
        transporte = TransporteFalso((200, corpo_ok()))

        derivar(provedor_groq(transporte))

        mensagens = json.loads(transporte.pedidos[0].content)['messages']
        self.assertEqual([mensagem['role'] for mensagem in mensagens], ['system', 'user'])
        self.assertIn('Deteccao rapida', mensagens[1]['content'])

    def test_a_execucao_registra_o_provedor_o_modelo_e_os_tokens(self):
        resultado = derivar(provedor_groq(TransporteFalso((200, corpo_ok()))))

        execucao = ExecucaoIA.objects.get()
        self.assertFalse(resultado['fallback_usado'])
        self.assertEqual(resultado['dados'], {'competencias': []})
        self.assertEqual(execucao.provedor, 'groq')
        self.assertEqual(execucao.modelo, 'modelo-de-teste')
        self.assertEqual(execucao.status, StatusExecucao.OK)
        self.assertEqual((execucao.tokens_entrada, execucao.tokens_saida), (120, 30))

    @override_settings(
        AI_GROQ_CUSTO_ENTRADA_BRL_POR_MILHAO=1.0,
        AI_GROQ_CUSTO_SAIDA_BRL_POR_MILHAO=10.0,
    )
    def test_o_custo_usa_o_preco_do_proprio_provedor(self):
        derivar(provedor_groq(TransporteFalso((200, corpo_ok(entrada=1_000_000, saida=100_000)))))

        self.assertAlmostEqual(float(ExecucaoIA.objects.get().custo_estimado), 2.0)

    @override_settings(AI_GROQ_GRATUITO=True)
    def test_provedor_gratuito_tem_custo_zero_apurado(self):
        """Modelo gratuito custa zero de verdade: e conta medida, nao ausencia de tabela."""
        derivar(provedor_groq(TransporteFalso((200, corpo_ok()))))

        self.assertEqual(float(ExecucaoIA.objects.get().custo_estimado), 0.0)

    def test_sem_preco_nem_marca_de_gratuito_o_custo_fica_sem_apuracao(self):
        derivar(provedor_groq(TransporteFalso((200, corpo_ok()))))

        self.assertIsNone(ExecucaoIA.objects.get().custo_estimado)

    def test_429_e_5xx_sao_tentados_de_novo(self):
        transporte = TransporteFalso((429, {'error': 'cota'}), (200, corpo_ok()))

        resultado = derivar(provedor_groq(transporte))

        self.assertFalse(resultado['fallback_usado'])
        self.assertEqual(len(transporte.pedidos), 2)

    def test_chave_recusada_nao_e_repetida_e_cai_no_fallback(self):
        transporte = TransporteFalso((401, {'error': 'chave'}), (200, corpo_ok()))

        resultado = derivar(provedor_groq(transporte))

        self.assertTrue(resultado['fallback_usado'])
        self.assertEqual(resultado['motivo_fallback'], 'falha_do_provedor')
        self.assertEqual(len(transporte.pedidos), 1)

    def test_tempo_esgotado_conta_como_passageiro(self):
        transporte = TransporteFalso(httpx.ReadTimeout('demorou'), (200, corpo_ok()))

        resultado = derivar(provedor_groq(transporte))

        self.assertFalse(resultado['fallback_usado'])
        self.assertEqual(len(transporte.pedidos), 2)


class ProvedorIndisponivelTests(TestCase):
    """Sem chave, endereco ou modelo, nada sai da maquina."""

    @override_settings(**{**CATALOGO_GROQ, 'GROQ_API_KEY': ''})
    def test_sem_chave_nasce_indisponivel(self):
        self.assertFalse(provedor_groq(TransporteFalso()).disponivel)

    @override_settings(**{**CATALOGO_GROQ, 'AI_GROQ_URL': ''})
    def test_sem_endereco_nasce_indisponivel(self):
        self.assertFalse(provedor_groq(TransporteFalso()).disponivel)

    @override_settings(**{**CATALOGO_GROQ, 'AI_GROQ_MODELO': ''})
    def test_sem_modelo_nasce_indisponivel(self):
        self.assertFalse(provedor_groq(TransporteFalso()).disponivel)

    @override_settings(**{**CATALOGO_GROQ, 'GROQ_API_KEY': ''})
    def test_indisponivel_entrega_o_fallback_sem_registrar_execucao(self):
        transporte = TransporteFalso()

        resultado = derivar(provedor_groq(transporte))

        self.assertTrue(resultado['fallback_usado'])
        self.assertEqual(resultado['motivo_fallback'], 'ia_indisponivel')
        self.assertEqual(transporte.pedidos, [])
        self.assertEqual(ExecucaoIA.objects.count(), 0)


class LeituraDaRespostaTests(TestCase):
    """Fail-fast na fronteira (AGENTS.md 2.2): resposta sem texto e erro claro."""

    def test_le_o_texto_e_os_tokens(self):
        resposta = ler_resposta(corpo_ok('{"ok": true}', entrada=7, saida=3))

        self.assertEqual(resposta.text, '{"ok": true}')
        self.assertEqual(resposta.usage_metadata.prompt_token_count, 7)
        self.assertEqual(resposta.usage_metadata.candidates_token_count, 3)

    def test_sem_uso_informado_os_tokens_ficam_para_a_estimativa(self):
        resposta = ler_resposta({'choices': [{'message': {'content': '{}'}}]})

        self.assertIsNone(resposta.usage_metadata)

    def test_resposta_sem_choices_e_fora_do_contrato(self):
        with self.assertRaises(RespostaForaDoContrato):
            ler_resposta({'error': {'message': 'modelo nao existe'}})

    def test_conteudo_que_nao_e_texto_e_fora_do_contrato(self):
        with self.assertRaises(RespostaForaDoContrato):
            ler_resposta({'choices': [{'message': {'content': None}}]})

    def test_resposta_fora_do_contrato_nao_e_passageira(self):
        self.assertFalse(falha_passageira(RespostaForaDoContrato('sem texto')))


class ClienteTests(TestCase):
    def test_o_endereco_aceita_barra_no_fim(self):
        transporte = TransporteFalso((200, corpo_ok()))
        cliente = ClienteCompativelComOpenAI(
            url_base='https://api.exemplo.test/v1/',
            api_key='chave',
            modelo='modelo',
            temperatura=0.2,
            transporte=transporte,
        )

        cliente.generate_content('prompt', request_options={'timeout': 5})

        self.assertEqual(
            str(transporte.pedidos[0].url), 'https://api.exemplo.test/v1/chat/completions'
        )
