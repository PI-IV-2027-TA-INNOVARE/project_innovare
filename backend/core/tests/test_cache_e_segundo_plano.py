"""
O cache dos limites de pedidos e o trabalho que sai do pedido.

Os contadores dos limites vivem no cache. Em memoria do processo, cada processo
do servidor conta o seu, e o limite real vira o configurado vezes o numero de
processos: com `CACHE_URL` o contador e um so. Cache fora do ar nao derruba a
API - o limite deixa de contar e o erro vai para o log.

O e-mail de recuperacao sai fora do pedido: dentro dele, a resposta demorava so
quando a conta existia, e o tempo contava o que o texto da resposta esconde.
"""
import threading
from unittest import mock

from django.conf import settings
from django.core.checks import Warning as AvisoDeConfiguracao
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from redis.exceptions import ConnectionError as RedisForaDoAr
from rest_framework import status
from rest_framework.test import APIClient

from core.cache import RedisTolerante
from core.checks import cache_compartilhado_em_producao
from core.configuracao import cache_da_aplicacao
from core.segundo_plano import em_segundo_plano

EM_MEMORIA = 'django.core.cache.backends.locmem.LocMemCache'


class CacheDaAplicacaoTests(SimpleTestCase):
    def test_sem_endereco_o_cache_fica_na_memoria_do_processo(self):
        self.assertEqual(cache_da_aplicacao('')['default']['BACKEND'], EM_MEMORIA)

    def test_com_endereco_o_cache_e_o_redis_tolerante_a_queda(self):
        cache = cache_da_aplicacao(' redis://127.0.0.1:6379/2 ')['default']

        self.assertEqual(cache['BACKEND'], 'core.cache.RedisTolerante')
        self.assertEqual(cache['LOCATION'], 'redis://127.0.0.1:6379/2')

    def test_o_redis_tem_tempo_maximo_de_espera(self):
        opcoes = cache_da_aplicacao('rediss://cache.exemplo.com.br:6380/0')['default']['OPTIONS']

        self.assertLessEqual(opcoes['socket_connect_timeout'], 2)
        self.assertLessEqual(opcoes['socket_timeout'], 2)

    def test_a_suite_nunca_usa_cache_compartilhado(self):
        cache = cache_da_aplicacao('redis://127.0.0.1:6379/2', rodando_testes=True)

        self.assertEqual(cache['default']['BACKEND'], EM_MEMORIA)

    def test_endereco_que_nao_e_redis_impede_a_subida(self):
        with self.assertRaises(ImproperlyConfigured):
            cache_da_aplicacao('memcached://127.0.0.1:11211')

    def test_a_suite_em_uso_esta_na_memoria(self):
        self.assertEqual(settings.CACHES['default']['BACKEND'], EM_MEMORIA)


class RedisToleranteTests(SimpleTestCase):
    def setUp(self):
        self.cache = RedisTolerante('redis://127.0.0.1:1/0', {})
        fora_do_ar = mock.Mock()

        for operacao in ('get', 'set', 'add', 'delete'):
            getattr(fora_do_ar, operacao).side_effect = RedisForaDoAr('sem conexao')

        self.cache._cache = fora_do_ar

    def test_leitura_com_o_cache_fora_do_ar_devolve_o_padrao(self):
        with self.assertLogs('core.cache', level='ERROR'):
            self.assertEqual(self.cache.get('chave', 'padrao'), 'padrao')

    def test_gravacao_com_o_cache_fora_do_ar_nao_levanta_erro(self):
        with self.assertLogs('core.cache', level='ERROR'):
            self.cache.set('chave', 1, 60)
            self.assertFalse(self.cache.add('chave', 1, 60))
            self.assertFalse(self.cache.delete('chave'))


class AvisoDeCacheEmProducaoTests(SimpleTestCase):
    @override_settings(EM_PRODUCAO=True)
    def test_producao_com_cache_em_memoria_recebe_aviso(self):
        avisos = cache_compartilhado_em_producao(None)

        self.assertEqual(len(avisos), 1)
        self.assertIsInstance(avisos[0], AvisoDeConfiguracao)
        self.assertIn('CACHE_URL', avisos[0].hint)

    @override_settings(
        EM_PRODUCAO=True,
        CACHES={'default': {'BACKEND': 'core.cache.RedisTolerante', 'LOCATION': 'redis://x'}},
    )
    def test_producao_com_cache_compartilhado_nao_recebe_aviso(self):
        self.assertEqual(cache_compartilhado_em_producao(None), [])

    @override_settings(EM_PRODUCAO=False)
    def test_local_nao_recebe_aviso(self):
        self.assertEqual(cache_compartilhado_em_producao(None), [])


class SegundoPlanoTests(SimpleTestCase):
    def test_na_suite_a_tarefa_roda_na_hora(self):
        feito = []

        em_segundo_plano(feito.append, 'e-mail')

        self.assertEqual(feito, ['e-mail'])

    @override_settings(SEGUNDO_PLANO_IMEDIATO=False)
    def test_fora_da_suite_quem_chama_nao_espera_a_tarefa(self):
        liberar = threading.Event()
        terminou = threading.Event()

        def tarefa_demorada():
            liberar.wait(5)
            terminou.set()

        em_segundo_plano(tarefa_demorada)

        self.assertFalse(terminou.is_set())
        liberar.set()
        self.assertTrue(terminou.wait(5))

    @override_settings(SEGUNDO_PLANO_IMEDIATO=False)
    def test_falha_da_tarefa_vai_para_o_log_e_nao_para_quem_chamou(self):
        registrou = threading.Event()

        def tarefa_que_falha():
            raise RuntimeError('transporte fora do ar')

        with mock.patch('core.segundo_plano.logger') as logger:
            logger.exception.side_effect = lambda *a, **k: registrou.set()
            em_segundo_plano(tarefa_que_falha)

            self.assertTrue(registrou.wait(5))


class RecuperacaoForaDoPedidoTests(TestCase):
    @override_settings(SEGUNDO_PLANO_IMEDIATO=False)
    def test_a_resposta_nao_espera_o_envio_do_email(self):
        liberar = threading.Event()
        terminou = threading.Event()

        def envio_demorado(_servico, _email):
            liberar.wait(5)
            terminou.set()

        with mock.patch(
            'apps.accounts.views.SolicitarRecuperacaoSenhaService.execute',
            autospec=True,
            side_effect=envio_demorado,
        ):
            resposta = APIClient().post(
                reverse('auth-forgot-password'),
                {'email': 'alguem@exemplo.com.br'},
                format='json',
            )

            self.assertEqual(resposta.status_code, status.HTTP_200_OK)
            self.assertFalse(terminou.is_set())
            liberar.set()
            self.assertTrue(terminou.wait(5))
