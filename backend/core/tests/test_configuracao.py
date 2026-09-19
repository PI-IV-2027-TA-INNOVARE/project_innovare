"""Trava que impede producao de subir com a chave de assinatura de dev."""
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from core.configuracao import CHAVE_DE_DESENVOLVIMENTO, chave_de_assinatura

CHAVE_PROPRIA = 'k9x!7cqw2m4v8zb3n6t1s5rj0hgl-pd-connect'


class ChaveDeAssinaturaTests(SimpleTestCase):
    def test_producao_recusa_subir_sem_chave_propria(self):
        with self.assertRaises(ImproperlyConfigured):
            chave_de_assinatura('', debug=False)

    def test_producao_recusa_a_chave_que_esta_no_repositorio(self):
        with self.assertRaises(ImproperlyConfigured):
            chave_de_assinatura(CHAVE_DE_DESENVOLVIMENTO, debug=False)

    def test_o_erro_ensina_a_gerar_uma_chave(self):
        """Quem toma o erro no deploy precisa sair dele sabendo o que fazer."""
        with self.assertRaises(ImproperlyConfigured) as capturado:
            chave_de_assinatura('', debug=False)

        self.assertIn('get_random_secret_key', str(capturado.exception))

    def test_producao_aceita_chave_propria(self):
        self.assertEqual(
            chave_de_assinatura(CHAVE_PROPRIA, debug=False), CHAVE_PROPRIA
        )

    def test_desenvolvimento_sobe_sem_chave_configurada(self):
        """Em dev a falta de chave nao pode travar quem acabou de clonar."""
        self.assertEqual(
            chave_de_assinatura('', debug=True), CHAVE_DE_DESENVOLVIMENTO
        )

    def test_espaco_em_branco_conta_como_ausencia(self):
        with self.assertRaises(ImproperlyConfigured):
            chave_de_assinatura('   ', debug=False)
