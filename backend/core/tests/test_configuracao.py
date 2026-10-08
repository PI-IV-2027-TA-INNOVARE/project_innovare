"""
Travas de configuracao: a chave de assinatura e o isolamento da suite.

As duas tem o mesmo desenho - regra de seguranca sem teste e regra que ninguem
percebe quando quebra (ver `core/configuracao.py`).
"""
from django.conf import settings
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


class IsolamentoDuranteOsTestesTests(SimpleTestCase):
    """
    O `.env` de uma maquina de trabalho carrega credencial real: SMTP
    autenticado, banco remoto, chave de IA.

    O mandato 0.1 do AGENTS.md diz que a suite nao toca nenhum deles, e o
    `settings.py` impoe isso em vez de confiar na configuracao. Estes casos
    afirmam o resultado sobre as settings **desta** execucao: se a trava saisse
    do lugar, a conta chega aqui - nao numa cota de API consumida, num banco de
    cliente dropado ou num e-mail entregue a um endereco de verdade.
    """

    def test_o_transporte_de_email_e_locmem(self):
        self.assertEqual(
            settings.EMAIL_BACKEND,
            'django.core.mail.backends.locmem.EmailBackend',
        )

    def test_nenhuma_notificacao_por_email_sai(self):
        self.assertFalse(settings.SEND_NOTIFICATION_EMAILS)

    def test_a_ia_externa_fica_sem_chave_e_desligada(self):
        self.assertEqual(settings.GEMINI_API_KEY, '')
        self.assertFalse(settings.AI_MATCH_RERANK_ENABLED)

    def test_o_banco_em_uso_nao_e_remoto(self):
        host = settings.DATABASES['default'].get('HOST', '')

        self.assertIn(host.strip().lower(), settings.LOCAL_DB_HOSTS)

    def test_o_throttling_nao_estrangula_a_suite(self):
        taxas = settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']

        self.assertTrue(all(taxa is None for taxa in taxas.values()))
