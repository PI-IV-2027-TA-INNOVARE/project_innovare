"""
Testes do provedor de IA.

`ProvedorGemini` e **gateway**, nao caso de uso: ele traduz chamada ao Gemini,
grava a rastreabilidade em `ExecucaoIA` e garante o fallback. Os casos de uso
(`*Service`, um por classe, com `execute()`) nascem nas fases do Copiloto, do
matching e da pre-analise, e recebem este gateway por construtor (plano 7.3).

Nenhum destes testes abre socket: `settings.py` esvazia `GEMINI_API_KEY`
durante a suite, e sem chave o provedor nasce indisponivel (AGENTS.md 0.1).
"""
import importlib
import inspect
import pkgutil
import uuid

from google.api_core import exceptions as excecoes_google

from django.test import TestCase, override_settings

from apps.ai.models import ExecucaoIA, TipoExecucaoIA
from apps.ai.services import ProvedorGemini


class ProvedorIndisponivelTests(TestCase):
    """
    O caminho que a suite inteira percorre: sem chave, nada sai da maquina.

    AGENTS.md 0.2 exige fallback seguro em todo componente de IA. Aqui ele e
    verificado no ponto em que importa - o provedor devolve o resultado do
    fallback em vez de levantar excecao ou tentar a rede.
    """

    @override_settings(GEMINI_API_KEY='')
    def test_sem_chave_o_provedor_nasce_indisponivel(self):
        self.assertFalse(ProvedorGemini().disponivel)

    @override_settings(GEMINI_API_KEY='')
    def test_indisponivel_entrega_o_fallback_e_nao_registra_execucao(self):
        resultado = ProvedorGemini().derivar_competencias(
            oportunidade_id=None,
            proposta_texto='Deteccao rapida de contaminacao.',
            correlation_id=uuid.uuid4(),
            executado_por='supervisor@ac2microbiologia.com.br',
        )

        self.assertTrue(resultado['fallback_usado'])
        self.assertIsNone(resultado['execucao_ia'])
        self.assertEqual(ExecucaoIA.objects.count(), 0)


class ModeloDoProvedorTests(TestCase):
    """
    O modelo e configuracao, e o registro diz qual modelo respondeu.

    `AI_MATCH_GEMINI_MODEL` ja era lido pelo painel de saude e gravado em
    `ExecucaoMatching.versao_modelo`. Enquanto o gateway nao o lesse, trocar o
    modelo no `.env` movia esses dois e nao movia a chamada: o painel anunciava
    um modelo, a execucao de matching registrava outro e o provedor chamava um
    terceiro. Rastreabilidade que aponta para o modelo errado e pior que
    rastreabilidade nenhuma, porque a decisao do Supervisor fica assinada sobre
    ela (AGENTS.md 0.2); e numero de modelo em codigo e o numero magico que o
    AGENTS.md 2.4 proibe.
    """

    @override_settings(GEMINI_API_KEY='', AI_MATCH_GEMINI_MODEL='gemini-3-pro')
    def test_o_modelo_vem_das_settings_e_nao_do_codigo(self):
        self.assertEqual(ProvedorGemini().modelo, 'gemini-3-pro')

    @override_settings(GEMINI_API_KEY='', AI_MATCH_GEMINI_MODEL='gemini-3-pro')
    def test_o_registro_grava_o_modelo_em_uso(self):
        registro = ProvedorGemini()._criar_execucao(
            tipo=TipoExecucaoIA.COPILOTO,
            oportunidade_id=None,
            correlation_id=uuid.uuid4(),
            prompt_versao='copiloto_v1',
            parametros={},
        )

        registro.refresh_from_db()
        self.assertEqual(registro.modelo, 'gemini-3-pro')

    @override_settings(GEMINI_API_KEY='', AI_MATCH_GEMINI_MODEL='gemini-3-pro')
    def test_o_modelo_pedido_por_construtor_vence_a_settings_e_e_o_gravado(self):
        provedor = ProvedorGemini(modelo='gemini-3-flash')

        registro = provedor._criar_execucao(
            tipo=TipoExecucaoIA.COPILOTO,
            oportunidade_id=None,
            correlation_id=uuid.uuid4(),
            prompt_versao='copiloto_v1',
            parametros={},
        )

        self.assertEqual(provedor.modelo, 'gemini-3-flash')
        self.assertEqual(registro.modelo, 'gemini-3-flash')


class CamadaDoProvedorTests(TestCase):
    """
    O provedor nao se disfarca de caso de uso.

    `core/tests/test_tipagem.py` cobra `execute()` de toda classe `*Service`
    porque, na convencao do projeto, Service Object e um caso de uso por
    classe. Um gateway com quatro operacoes nao cabe nesse contrato: chamar-se
    `Service` fazia a varredura cobrar dele um `execute()` que nao existe, e a
    resposta certa e o nome, nao um metodo-guarda-chuva.
    """

    def test_apps_ai_services_nao_expoe_caso_de_uso(self):
        pacote = importlib.import_module('apps.ai.services')

        modulos = [pacote] + [
            importlib.import_module(f'apps.ai.services.{info.name}')
            for info in pkgutil.iter_modules(pacote.__path__)
        ]

        encontrados = [
            nome
            for modulo in modulos
            for nome, objeto in vars(modulo).items()
            if inspect.isclass(objeto) and nome.endswith('Service')
        ]

        self.assertEqual(encontrados, [])


class ClienteFalso:
    """Faz as vezes do `GenerativeModel`: devolve ou levanta, na ordem dada."""

    def __init__(self, *respostas):
        self._respostas = list(respostas)
        self.chamadas = []

    def generate_content(self, prompt, **kwargs):
        self.chamadas.append(kwargs)
        resposta = self._respostas.pop(0)
        if isinstance(resposta, Exception):
            raise resposta
        return resposta


class RespostaFalsa:
    text = '{"competencias": []}'
    usage_metadata = None


@override_settings(
    AI_GEMINI_TIMEOUT_S=40,
    AI_GEMINI_TENTATIVAS=3,
    AI_GEMINI_ESPERA_INICIAL_S=1.5,
)
class TimeoutERetryTests(TestCase):
    """
    `Metodos_Integracao_IA.md`, API externa: "timeout e retry limitado;
    tratamento de 429, 5xx e indisponibilidade".

    Sem timeout, um provedor travado prendia a requisicao pelo tempo que ele
    quisesse. Sem retry, um 503 passageiro virava modo sem IA na hora. Retry
    so vale para o que e passageiro: um 400 repetido devolve o mesmo 400.
    """

    def _provedor(self, *respostas):
        self.esperas = []
        self.cliente = ClienteFalso(*respostas)
        return ProvedorGemini(cliente=self.cliente, dormir=self.esperas.append)

    def _derivar(self, provedor):
        return provedor.derivar_competencias(
            oportunidade_id=None,
            proposta_texto='Deteccao rapida de contaminacao.',
            correlation_id=uuid.uuid4(),
            executado_por='supervisor@ac2microbiologia.com.br',
        )

    def test_toda_chamada_leva_o_timeout_das_settings(self):
        provedor = self._provedor(RespostaFalsa())

        self._derivar(provedor)

        self.assertEqual(self.cliente.chamadas[0]['request_options']['timeout'], 40)

    def test_429_e_5xx_sao_tentados_de_novo_com_espera_crescente(self):
        provedor = self._provedor(
            excecoes_google.TooManyRequests('cota'),
            excecoes_google.ServiceUnavailable('fora'),
            RespostaFalsa(),
        )

        resultado = self._derivar(provedor)

        self.assertFalse(resultado['fallback_usado'])
        self.assertEqual(len(self.cliente.chamadas), 3)
        self.assertEqual(self.esperas, [1.5, 3.0])

    def test_timeout_estourado_conta_como_passageiro(self):
        provedor = self._provedor(
            excecoes_google.DeadlineExceeded('demorou'), RespostaFalsa()
        )

        resultado = self._derivar(provedor)

        self.assertFalse(resultado['fallback_usado'])
        self.assertEqual(len(self.cliente.chamadas), 2)

    def test_esgotadas_as_tentativas_cai_no_fallback_e_registra_o_erro(self):
        provedor = self._provedor(
            *[excecoes_google.InternalServerError('quebrou')] * 3
        )

        resultado = self._derivar(provedor)

        self.assertTrue(resultado['fallback_usado'])
        self.assertEqual(len(self.cliente.chamadas), 3)
        self.assertEqual(len(self.esperas), 2)
        execucao = ExecucaoIA.objects.get()
        self.assertIn('3 tentativas', execucao.erro)

    def test_erro_que_nao_e_passageiro_nao_e_repetido(self):
        provedor = self._provedor(
            excecoes_google.InvalidArgument('prompt invalido'), RespostaFalsa()
        )

        resultado = self._derivar(provedor)

        self.assertTrue(resultado['fallback_usado'])
        self.assertEqual(len(self.cliente.chamadas), 1)
        self.assertEqual(self.esperas, [])


class RespostaComTexto:
    usage_metadata = None

    def __init__(self, texto, entrada=10, saida=20):
        self.text = texto

        class Uso:
            prompt_token_count = entrada
            candidates_token_count = saida

        self.usage_metadata = Uso()


@override_settings(AI_GEMINI_TENTATIVAS=1)
class JsonInvalidoTests(TestCase):
    """
    Tabela de falhas de Engenharia_IA: JSON invalido -> "tentar uma correcao
    controlada". A correcao e pedir de novo, uma vez, o mesmo prompt - mudar o
    prompt seria portao de decisao (AGENTS.md 3.2). Persistindo, o resultado
    continua marcado como erro, e o caso de uso cai no caminho sem IA.
    """

    def _derivar(self, *respostas):
        self.cliente = ClienteFalso(*respostas)
        provedor = ProvedorGemini(cliente=self.cliente, dormir=lambda _segundos: None)
        return provedor.derivar_competencias(
            oportunidade_id=None,
            proposta_texto='Deteccao rapida de contaminacao.',
            correlation_id=uuid.uuid4(),
            executado_por='supervisor@ac2microbiologia.com.br',
        )

    def test_json_invalido_e_pedido_de_novo_uma_vez(self):
        resultado = self._derivar(
            RespostaComTexto('isto nao e json'),
            RespostaComTexto('{"competencias": []}'),
        )

        self.assertEqual(len(self.cliente.chamadas), 2)
        self.assertEqual(resultado['dados'], {'competencias': []})
        self.assertEqual(resultado['execucao_ia'].status, 'ok')

    def test_os_tokens_das_duas_chamadas_entram_na_conta(self):
        resultado = self._derivar(
            RespostaComTexto('isto nao e json', entrada=10, saida=20),
            RespostaComTexto('{"competencias": []}', entrada=11, saida=5),
        )

        execucao = resultado['execucao_ia']
        execucao.refresh_from_db()
        self.assertEqual(execucao.tokens_entrada, 21)
        self.assertEqual(execucao.tokens_saida, 25)

    def test_persistindo_o_erro_nao_ha_terceira_chamada(self):
        resultado = self._derivar(
            RespostaComTexto('isto nao e json'),
            RespostaComTexto('nem isto'),
        )

        self.assertEqual(len(self.cliente.chamadas), 2)
        self.assertTrue(resultado['dados'].get('_erro_parse'))
        self.assertEqual(resultado['execucao_ia'].status, 'erro')

    def test_json_valido_de_primeira_nao_repete(self):
        self._derivar(RespostaComTexto('{"competencias": []}'))

        self.assertEqual(len(self.cliente.chamadas), 1)
