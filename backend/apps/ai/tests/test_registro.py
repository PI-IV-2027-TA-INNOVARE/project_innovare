"""
Registro de provedores de IA e modelo de reserva (SPEC-23/SPEC-14).

O registro existe para que o provedor seja configuração, não import espalhado:
quem consome pede o principal, e o `.env` decide qual é. O modelo de reserva é
a segunda tentativa quando o principal falha - nunca quando o que falhou foi o
teto de gasto, que vale para todos.

Nenhum teste abre socket: os provedores usados aqui são dubles locais.
"""
from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, override_settings

from apps.ai.models import ExecucaoIA, StatusExecucao, TipoExecucaoIA
from apps.ai.services.registro import (
    ProvedorComReserva,
    ProvedorRegistrado,
    desregistrar,
    descritor,
    papeis_configurados,
    precos_do_provedor,
    provedor_com_reserva,
    provedor_configurado,
    provedor_principal,
    registrar,
)
from apps.ai.services.saude import saude_da_plataforma


class ProvedorFalso:
    """Provedor local: devolve o que o teste pedir, sem tocar a rede."""

    disponivel = True

    def __init__(self, *, resultado=None, chamadas=None, **kwargs):
        self.resultado = resultado or {
            'dados': {'competencias': [{'descricao': 'Microbiologia'}]},
            'execucao_ia': None,
            'fallback_usado': False,
            'motivo_fallback': None,
        }
        self.chamadas = chamadas if chamadas is not None else []
        self.kwargs = kwargs

    def derivar_competencias(self, **kwargs):
        self.chamadas.append('derivar_competencias')
        return self.resultado


class RegistroTests(TestCase):
    def setUp(self):
        self.chamadas = []

    def tearDown(self):
        for nome in ('fake_principal', 'fake_reserva'):
            desregistrar(nome)

    def registrar_falso(self, nome, *, resultado=None):
        registrar(
            ProvedorRegistrado(
                nome=nome,
                rotulo=f'Provedor {nome}',
                fabrica=lambda **kwargs: ProvedorFalso(
                    resultado=resultado, chamadas=self.chamadas, **kwargs
                ),
                chave_setting='GEMINI_API_KEY',
                modelo_setting='AI_MATCH_GEMINI_MODEL',
                preco_entrada_setting='AI_CUSTO_ENTRADA_BRL_POR_MILHAO',
                preco_saida_setting='AI_CUSTO_SAIDA_BRL_POR_MILHAO',
            )
        )

    def test_google_e_o_principal_por_padrao(self):
        self.assertEqual(descritor('google').nome, 'google')
        self.assertEqual(provedor_principal().provedor, 'google')

    @override_settings(AI_PROVEDOR_PRINCIPAL='nao_existe')
    def test_provedor_principal_nao_registrado_falha_alto(self):
        with self.assertRaises(ImproperlyConfigured):
            provedor_principal()

    @override_settings(AI_PROVEDOR_PRINCIPAL='fake_principal')
    def test_o_principal_pode_ser_trocado_pelo_env(self):
        self.registrar_falso('fake_principal')

        provedor = provedor_principal()

        self.assertIsInstance(provedor.decorado, ProvedorFalso)

    @override_settings(
        AI_PROVEDOR_PRINCIPAL='fake_principal',
        AI_PROVEDOR_RESERVA='fake_reserva',
    )
    def test_reserva_assume_quando_o_principal_falha(self):
        self.registrar_falso(
            'fake_principal',
            resultado={
                'dados': {'competencias': []},
                'execucao_ia': None,
                'fallback_usado': True,
                'motivo_fallback': 'falha_do_provedor',
            },
        )
        self.registrar_falso('fake_reserva')

        resultado = provedor_com_reserva().derivar_competencias()

        self.assertTrue(resultado['fallback_usado'])
        self.assertEqual(resultado['motivo_fallback'], 'modelo_de_reserva')
        self.assertEqual(resultado['dados']['competencias'][0]['descricao'], 'Microbiologia')
        self.assertEqual(self.chamadas, ['derivar_competencias', 'derivar_competencias'])

    @override_settings(
        AI_PROVEDOR_PRINCIPAL='fake_principal',
        AI_PROVEDOR_RESERVA='fake_reserva',
    )
    def test_reserva_nao_fura_o_limite_de_gasto(self):
        self.registrar_falso(
            'fake_principal',
            resultado={
                'dados': {'competencias': []},
                'execucao_ia': None,
                'fallback_usado': True,
                'motivo_fallback': 'limite_do_mes',
            },
        )
        self.registrar_falso('fake_reserva')

        resultado = provedor_com_reserva().derivar_competencias()

        self.assertEqual(resultado['motivo_fallback'], 'limite_do_mes')
        self.assertEqual(self.chamadas, ['derivar_competencias'])

    @override_settings(
        AI_PROVEDOR_PRINCIPAL='fake_principal',
        AI_PROVEDOR_RESERVA='',
        AI_MODELO_RESERVA='',
    )
    def test_sem_reserva_configurada_o_principal_responde_sozinho(self):
        self.registrar_falso('fake_principal')

        provedor = provedor_com_reserva()

        self.assertIsInstance(provedor.decorado, ProvedorFalso)

    @override_settings(
        AI_PROVEDOR_PRINCIPAL='fake_principal',
        AI_PROVEDOR_RESERVA='',
        AI_MODELO_RESERVA='modelo-de-reserva',
    )
    def test_modelo_de_reserva_usa_o_mesmo_provedor(self):
        self.registrar_falso(
            'fake_principal',
            resultado={
                'dados': {'competencias': []},
                'execucao_ia': None,
                'fallback_usado': True,
                'motivo_fallback': 'falha_do_provedor',
            },
        )

        provedor = provedor_com_reserva()

        self.assertEqual(provedor._reservas[0].kwargs['modelo'], 'modelo-de-reserva')

    @override_settings(
        AI_CUSTO_ENTRADA_BRL_POR_MILHAO=1.0,
        AI_CUSTO_SAIDA_BRL_POR_MILHAO=4.0,
    )
    def test_o_preco_e_do_provedor_e_nao_um_numero_unico(self):
        self.assertEqual(precos_do_provedor('google'), (1.0, 4.0))
        self.assertTrue(provedor_configurado('google') is False)

    @override_settings(GEMINI_API_KEY='')
    def test_a_saude_mostra_uma_linha_por_provedor_registrado(self):
        ExecucaoIA.objects.create(
            tipo=TipoExecucaoIA.PREANALISE,
            provedor='google',
            modelo='gemini-2.5-flash',
            status=StatusExecucao.OK,
            custo_estimado='1.000000',
        )

        provedores = saude_da_plataforma()['ia']['provedores']

        google = next(item for item in provedores if item['nome'] == 'google')
        self.assertEqual(google['papel'], 'principal')
        self.assertEqual(google['chamadas'], 1)
        self.assertEqual(google['custo_estimado_brl'], 1.0)


FALHOU = {
    'dados': {'competencias': []},
    'execucao_ia': None,
    'fallback_usado': True,
    'motivo_fallback': 'falha_do_provedor',
}

SEM_CHAVE = {**FALHOU, 'motivo_fallback': 'ia_indisponivel'}


@override_settings(AI_PROVEDOR_PRINCIPAL='fake_principal', AI_MODELO_RESERVA='')
class ReservasEmFilaTests(TestCase):
    """
    A reserva é uma lista: cada uma só responde quando todas as anteriores
    falharam, e a primeira que responde encerra a fila.
    """

    NOMES = ('fake_principal', 'fake_primeira', 'fake_segunda')

    def setUp(self):
        self.chamadas = []

    def tearDown(self):
        for nome in self.NOMES:
            desregistrar(nome)

    def registrar_falso(self, nome, *, resultado=None):
        chamadas = self.chamadas

        class Anotado(ProvedorFalso):
            def derivar_competencias(self, **kwargs):
                chamadas.append(nome)
                return self.resultado

        registrar(
            ProvedorRegistrado(
                nome=nome,
                rotulo=nome,
                fabrica=lambda **kwargs: Anotado(resultado=resultado, **kwargs),
                chave_setting='GEMINI_API_KEY',
                modelo_setting='AI_MATCH_GEMINI_MODEL',
                preco_entrada_setting='AI_CUSTO_ENTRADA_BRL_POR_MILHAO',
                preco_saida_setting='AI_CUSTO_SAIDA_BRL_POR_MILHAO',
            )
        )

    @override_settings(AI_PROVEDOR_RESERVA='fake_primeira, fake_segunda')
    def test_a_segunda_reserva_responde_quando_a_primeira_tambem_falha(self):
        self.registrar_falso('fake_principal', resultado=FALHOU)
        self.registrar_falso('fake_primeira', resultado=SEM_CHAVE)
        self.registrar_falso('fake_segunda')

        resultado = provedor_com_reserva().derivar_competencias()

        self.assertEqual(self.chamadas, ['fake_principal', 'fake_primeira', 'fake_segunda'])
        self.assertEqual(resultado['motivo_fallback'], 'modelo_de_reserva')
        self.assertEqual(resultado['dados']['competencias'][0]['descricao'], 'Microbiologia')

    @override_settings(AI_PROVEDOR_RESERVA='fake_primeira,fake_segunda')
    def test_a_primeira_reserva_que_responde_encerra_a_fila(self):
        self.registrar_falso('fake_principal', resultado=FALHOU)
        self.registrar_falso('fake_primeira')
        self.registrar_falso('fake_segunda')

        provedor_com_reserva().derivar_competencias()

        self.assertEqual(self.chamadas, ['fake_principal', 'fake_primeira'])

    @override_settings(AI_PROVEDOR_RESERVA='fake_primeira,fake_segunda')
    def test_todas_falhando_o_resultado_e_o_caminho_sem_ia(self):
        self.registrar_falso('fake_principal', resultado=FALHOU)
        self.registrar_falso('fake_primeira', resultado=FALHOU)
        self.registrar_falso('fake_segunda', resultado=FALHOU)

        resultado = provedor_com_reserva().derivar_competencias()

        self.assertEqual(len(self.chamadas), 3)
        self.assertTrue(resultado['fallback_usado'])
        self.assertEqual(resultado['motivo_fallback'], 'falha_do_provedor')

    @override_settings(AI_PROVEDOR_RESERVA='fake_primeira,fake_segunda')
    def test_reserva_que_levanta_excecao_passa_a_vez(self):
        self.registrar_falso('fake_principal', resultado=FALHOU)
        self.registrar_falso('fake_segunda')
        registrar(
            ProvedorRegistrado(
                nome='fake_primeira',
                rotulo='fake_primeira',
                fabrica=lambda **kwargs: ProvedorQueQuebra(),
                chave_setting='GEMINI_API_KEY',
                modelo_setting='AI_MATCH_GEMINI_MODEL',
                preco_entrada_setting='AI_CUSTO_ENTRADA_BRL_POR_MILHAO',
                preco_saida_setting='AI_CUSTO_SAIDA_BRL_POR_MILHAO',
            )
        )

        resultado = provedor_com_reserva().derivar_competencias()

        self.assertEqual(self.chamadas, ['fake_principal', 'fake_segunda'])
        self.assertEqual(resultado['motivo_fallback'], 'modelo_de_reserva')

    @override_settings(AI_PROVEDOR_RESERVA='fake_primeira,fake_principal,fake_primeira')
    def test_a_lista_nao_repete_o_principal_nem_uma_reserva(self):
        for nome in self.NOMES:
            self.registrar_falso(nome)

        self.assertEqual(
            list(papeis_configurados().values()), ['principal', 'reserva']
        )

    @override_settings(AI_PROVEDOR_RESERVA='fake_primeira')
    def test_toda_operacao_de_ia_passa_pela_fila_de_reservas(self):
        """Não só a pré-análise: o Copiloto, as competências e o matching também."""
        from apps.competencies.services import DerivarCompetenciasService
        from apps.copilot.services import EstruturarPropostaService, IniciarSessaoService
        from apps.matching.services import ExecutarMatchingService
        from apps.maturity.services import PreAnalisarService

        self.registrar_falso('fake_principal')
        self.registrar_falso('fake_primeira')

        for servico in (
            IniciarSessaoService,
            EstruturarPropostaService,
            DerivarCompetenciasService,
            ExecutarMatchingService,
            PreAnalisarService,
        ):
            with self.subTest(servico=servico.__name__):
                self.assertIsInstance(
                    servico()._resolver_provedor().decorado, ProvedorComReserva
                )

    @override_settings(AI_PROVEDOR_RESERVA='fake_segunda,fake_primeira')
    def test_os_papeis_seguem_a_ordem_da_lista(self):
        for nome in self.NOMES:
            self.registrar_falso(nome)

        self.assertEqual(
            [nome for nome, _modelo in papeis_configurados()],
            ['fake_principal', 'fake_segunda', 'fake_primeira'],
        )


class ProvedorQueQuebra:
    disponivel = True

    def derivar_competencias(self, **kwargs):
        raise RuntimeError('quebrou')


CATALOGO = {
    'AI_PROVEDORES_COMPATIVEIS': ['groq', 'openrouter'],
    'GROQ_API_KEY': 'chave-groq',
    'AI_GROQ_URL': 'https://api.exemplo.test/groq/v1',
    'AI_GROQ_MODELO': 'modelo-groq',
    'AI_GROQ_ROTULO': 'Groq',
    'OPENROUTER_API_KEY': '',
    'AI_OPENROUTER_URL': 'https://api.exemplo.test/openrouter/v1',
    'AI_OPENROUTER_MODELO': 'modelo-openrouter',
}


@override_settings(**CATALOGO)
class CatalogoDoEnvTests(TestCase):
    """
    O provedor compatível com a OpenAI entra pelo `.env`, sem código: o nome na
    lista e, para cada nome, a chave, o endereço e o modelo.
    """

    def test_cada_nome_do_catalogo_vira_um_provedor_registrado(self):
        groq = descritor('groq')

        self.assertEqual(groq.rotulo, 'Groq')
        self.assertEqual(groq.modelo(), 'modelo-groq')
        self.assertTrue(groq.configurado())

    def test_sem_rotulo_o_nome_aparece_no_lugar(self):
        self.assertEqual(descritor('openrouter').rotulo, 'openrouter')

    def test_sem_chave_o_provedor_do_catalogo_nao_esta_configurado(self):
        self.assertFalse(descritor('openrouter').configurado())

    @override_settings(AI_GROQ_URL='')
    def test_sem_endereco_o_provedor_do_catalogo_nao_esta_configurado(self):
        self.assertFalse(descritor('groq').configurado())

    @override_settings(
        AI_GROQ_CUSTO_ENTRADA_BRL_POR_MILHAO=0.5,
        AI_GROQ_CUSTO_SAIDA_BRL_POR_MILHAO=2.0,
    )
    def test_o_preco_do_catalogo_e_por_provedor(self):
        self.assertEqual(precos_do_provedor('groq'), (0.5, 2.0))

    def test_a_fabrica_entrega_o_adaptador_compativel(self):
        from apps.ai.services.compativel_openai import ProvedorCompativelComOpenAI

        provedor = descritor('groq').criar()

        self.assertIsInstance(provedor, ProvedorCompativelComOpenAI)
        self.assertEqual(provedor.provedor, 'groq')
        self.assertEqual(provedor.modelo, 'modelo-groq')
        self.assertTrue(provedor.disponivel)

    @override_settings(AI_PROVEDOR_PRINCIPAL='google', AI_PROVEDOR_RESERVA='groq,openrouter')
    def test_o_catalogo_entra_na_fila_de_reservas(self):
        provedor = provedor_com_reserva()

        self.assertEqual(
            [reserva.provedor for reserva in provedor._reservas], ['groq', 'openrouter']
        )

    @override_settings(AI_OPENROUTER_GRATUITO=True)
    def test_o_catalogo_pode_marcar_o_provedor_como_gratuito(self):
        self.assertTrue(descritor('openrouter').gratuito())
        self.assertFalse(descritor('groq').gratuito())
        self.assertFalse(descritor('google').gratuito())

    @override_settings(AI_PROVEDORES_COMPATIVEIS=['Groq-Cloud'])
    def test_nome_fora_do_padrao_falha_alto(self):
        with self.assertRaises(ImproperlyConfigured):
            descritor('Groq-Cloud')

    @override_settings(AI_PROVEDORES_COMPATIVEIS=['google'])
    def test_nome_que_ja_existe_no_codigo_falha_alto(self):
        with self.assertRaises(ImproperlyConfigured):
            descritor('google')

    @override_settings(AI_PROVEDORES_COMPATIVEIS='groq, openrouter')
    def test_o_catalogo_aceita_texto_separado_por_virgula(self):
        self.assertEqual(descritor('openrouter').nome, 'openrouter')
