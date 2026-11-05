"""
A medicao manual do tempo da estruturacao.

O comando chama o Gemini de verdade, por isso nunca roda aqui: a suite cobre a
conta da media e a recusa sem chave, com provedor duble (AGENTS.md 0.1).
"""
from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings

from apps.ai.management.commands.medir_estruturacao import ENTRADA_FICTICIA, medir


class ProvedorCronometrado:
    def __init__(self, *fallbacks):
        self._fallbacks = list(fallbacks)
        self.pedidos = []

    def estruturar_proposta(self, **kwargs):
        self.pedidos.append(kwargs)
        return {'dados': {}, 'execucao_ia': None, 'fallback_usado': self._fallbacks.pop(0)}


def relogio(*instantes):
    fila = list(instantes)
    return lambda: fila.pop(0)


class MedicaoTests(TestCase):
    def test_a_media_e_a_mediana_saem_das_rodadas_que_responderam(self):
        provedor = ProvedorCronometrado(False, False, False)

        resultado = medir(provedor, rodadas=3, relogio=relogio(0, 10, 10, 30, 30, 42))

        self.assertEqual(resultado['tempos_s'], [10, 20, 12])
        self.assertEqual(resultado['media_s'], 14)
        self.assertEqual(resultado['mediana_s'], 12)
        self.assertEqual(resultado['falhas'], 0)

    def test_rodada_sem_ia_conta_como_falha_e_fica_fora_da_media(self):
        provedor = ProvedorCronometrado(False, True)

        resultado = medir(provedor, rodadas=2, relogio=relogio(0, 8, 8, 9))

        self.assertEqual(resultado['tempos_s'], [8])
        self.assertEqual(resultado['falhas'], 1)

    def test_o_texto_enviado_e_ficticio_e_todos_os_elementos_estao_vazios(self):
        provedor = ProvedorCronometrado(False)

        medir(provedor, rodadas=1, relogio=relogio(0, 1))

        pedido = provedor.pedidos[0]
        self.assertEqual(pedido['entrada'], ENTRADA_FICTICIA)
        self.assertEqual(len(pedido['vazios']), 8)
        self.assertIsNone(pedido['oportunidade_id'])

    @override_settings(GEMINI_API_KEY='')
    def test_sem_chave_o_comando_recusa_em_vez_de_medir_o_caminho_sem_ia(self):
        with self.assertRaisesMessage(CommandError, 'GEMINI_API_KEY'):
            call_command('medir_estruturacao', rodadas=1)
