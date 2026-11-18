"""
O modelo de comparacao de textos carrega quando o servidor sobe.

Ele so carregava na primeira rodada de matching: importar a biblioteca e ler o
modelo levava mais de um minuto, e o `runserver` recomeca a cada mudanca de
codigo. A pessoa via "Comparando as competencias necessarias com a rede
interna" passar de 80 s, com as etapas travadas.

A carga ganhou uma trava: a rodada que chega durante o aquecimento espera o
modelo que ja esta carregando, em vez de carregar outro.
"""
import runpy
import sys
import threading
import types
from pathlib import Path
from unittest import mock

from django.apps import apps
from django.conf import settings
from django.test import SimpleTestCase, override_settings

from apps.ai.services import embedding


class AquecimentoTests(SimpleTestCase):
    @override_settings(SEARCH_EMBEDDING_ENABLED=True)
    def test_aquecer_pede_um_vetor_ao_modelo(self):
        provedor = mock.Mock()

        with mock.patch.object(embedding, 'provedor_minilm', return_value=provedor):
            self.assertTrue(embedding.aquecer_modelo())

        provedor.vetores.assert_called_once()

    @override_settings(SEARCH_EMBEDDING_ENABLED=False)
    def test_com_a_base_semantica_desligada_nao_carrega_nada(self):
        with mock.patch.object(embedding, 'provedor_minilm') as provedor:
            self.assertFalse(embedding.aquecer_modelo())

        provedor.assert_not_called()

    @override_settings(SEARCH_EMBEDDING_ENABLED=True)
    def test_falha_ao_aquecer_fica_no_registro_e_nao_derruba_o_servidor(self):
        provedor = mock.Mock()
        provedor.vetores.side_effect = OSError('modelo ausente')

        with (
            mock.patch.object(embedding, 'provedor_minilm', return_value=provedor),
            self.assertLogs(embedding.logger, 'WARNING'),
        ):
            self.assertFalse(embedding.aquecer_modelo())

    def test_aquece_em_segundo_plano_sem_prender_a_subida(self):
        with mock.patch.object(embedding, 'aquecer_modelo') as aquecer:
            linha = embedding.aquecer_em_segundo_plano()
            linha.join(timeout=5)

        self.assertTrue(linha.daemon)
        aquecer.assert_called_once()

    def test_so_o_processo_do_runserver_que_atende_aquece(self):
        self.assertTrue(embedding.deve_aquecer(['manage.py', 'runserver'], {'RUN_MAIN': 'true'}))
        self.assertTrue(embedding.deve_aquecer(['manage.py', 'runserver', '--noreload'], {}))
        self.assertFalse(embedding.deve_aquecer(['manage.py', 'runserver'], {}))
        self.assertFalse(embedding.deve_aquecer(['manage.py', 'test'], {'RUN_MAIN': 'true'}))
        self.assertFalse(embedding.deve_aquecer(['manage.py', 'migrate'], {}))

    def test_a_subida_do_django_aquece_quando_deve(self):
        configuracao = apps.get_app_config('ai')

        with (
            mock.patch.object(embedding, 'deve_aquecer', return_value=True),
            mock.patch.object(embedding, 'aquecer_em_segundo_plano') as aquecer,
        ):
            configuracao.ready()

        aquecer.assert_called_once()

    def test_a_subida_do_django_nao_aquece_fora_do_runserver(self):
        configuracao = apps.get_app_config('ai')

        with (
            mock.patch.object(embedding, 'deve_aquecer', return_value=False),
            mock.patch.object(embedding, 'aquecer_em_segundo_plano') as aquecer,
        ):
            configuracao.ready()

        aquecer.assert_not_called()

    def test_cada_processo_do_gunicorn_aquece_ao_iniciar(self):
        servidor = runpy.run_path(str(Path(settings.BASE_DIR) / 'gunicorn.conf.py'))

        with mock.patch.object(embedding, 'aquecer_em_segundo_plano') as aquecer:
            servidor['post_worker_init'](mock.Mock())

        aquecer.assert_called_once()


class CargaUnicaDoModeloTests(SimpleTestCase):
    def test_duas_chamadas_ao_mesmo_tempo_carregam_o_modelo_uma_vez(self):
        cargas = []
        comecou = threading.Event()
        liberar = threading.Event()

        def carregar(nome):
            cargas.append(nome)
            comecou.set()
            liberar.wait(5)
            return mock.Mock()

        biblioteca = types.SimpleNamespace(SentenceTransformer=carregar)
        provedor = embedding.ProvedorMiniLM(modelo='modelo-de-teste')

        with mock.patch.dict(sys.modules, {'sentence_transformers': biblioteca}):
            primeira = threading.Thread(target=provedor._modelo)
            segunda = threading.Thread(target=provedor._modelo)

            primeira.start()
            comecou.wait(5)
            segunda.start()
            segunda.join(0.2)
            liberar.set()
            primeira.join(5)
            segunda.join(5)

        self.assertEqual(cargas, ['modelo-de-teste'])
