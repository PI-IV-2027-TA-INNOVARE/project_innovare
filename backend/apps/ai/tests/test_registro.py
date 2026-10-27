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
    ProvedorRegistrado,
    desregistrar,
    descritor,
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

        self.assertIsInstance(provedor, ProvedorFalso)

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

        self.assertIsInstance(provedor, ProvedorFalso)

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

        self.assertEqual(provedor._reserva.kwargs['modelo'], 'modelo-de-reserva')

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
