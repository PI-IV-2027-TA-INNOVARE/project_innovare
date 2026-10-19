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
