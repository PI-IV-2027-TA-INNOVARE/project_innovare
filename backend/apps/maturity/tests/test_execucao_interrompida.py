"""
A pre-analise que nao termina.

A chamada a IA marca erro quando falha. Se o processo morre no meio - o
servidor reinicia, o tempo da requisicao estoura, a fila nao tem quem a
consuma -, ninguem marca nada: a linha ficava "executando" para sempre, e a
tela esperava sem fim, com o Reavaliar travado.

Passado o teto (`PREANALISE_TEMPO_MAXIMO_S`, que cobre o tempo que a IA pode
levar com as tentativas), a API apresenta a execucao como interrompida. A
leitura nao grava: se o processo ainda estiver vivo e terminar, o resultado
dele vale.
"""
from datetime import timedelta

from django.conf import settings
from django.test import override_settings
from django.utils import timezone

from apps.ai.models import StatusExecucao
from apps.maturity.models import PreAnalise
from apps.maturity.services import versao_vigente
from apps.maturity.tests.test_preanalise import PreAnaliseBaseTests


@override_settings(PREANALISE_TEMPO_MAXIMO_S=100)
class ExecucaoInterrompidaTests(PreAnaliseBaseTests):
    def setUp(self):
        super().setUp()
        self.importar_criterios()

    def execucao(self, status, *, ha_segundos):
        analise = PreAnalise.objects.create(
            proposta=self.proposta,
            versao_criterio=versao_vigente(),
            versao_proposta=self.proposta.versao,
            executada_por=self.supervisor.email,
            status=status,
        )
        PreAnalise.objects.filter(pk=analise.pk).update(
            executada_em=timezone.now() - timedelta(seconds=ha_segundos)
        )
        return analise

    def ler(self):
        return self.client.get(self.url()).data

    def test_executando_alem_do_teto_aparece_interrompida(self):
        self.execucao(StatusExecucao.EXECUTANDO, ha_segundos=101)

        dados = self.ler()

        self.assertEqual(dados['status'], StatusExecucao.ERRO)
        self.assertEqual(dados['status_rotulo'], StatusExecucao.ERRO.label)
        self.assertEqual(dados['erro'], 'execucao_interrompida')

    def test_pendente_alem_do_teto_tambem_aparece_interrompida(self):
        """A fila sem quem a consuma deixa a execucao pendente para sempre."""
        self.execucao(StatusExecucao.PENDENTE, ha_segundos=101)

        self.assertEqual(self.ler()['erro'], 'execucao_interrompida')

    def test_dentro_do_teto_continua_em_andamento(self):
        self.execucao(StatusExecucao.EXECUTANDO, ha_segundos=60)

        dados = self.ler()

        self.assertEqual(dados['status'], StatusExecucao.EXECUTANDO)
        self.assertEqual(dados['erro'], '')

    def test_a_leitura_nao_grava(self):
        analise = self.execucao(StatusExecucao.EXECUTANDO, ha_segundos=500)

        self.ler()

        analise.refresh_from_db()
        self.assertEqual(analise.status, StatusExecucao.EXECUTANDO)
        self.assertEqual(analise.erro, '')

    def test_concluida_antiga_nao_vira_interrompida(self):
        self.execucao(StatusExecucao.OK, ha_segundos=10 * 24 * 60 * 60)

        self.assertEqual(self.ler()['status'], StatusExecucao.OK)


class TetoPadraoTests(PreAnaliseBaseTests):
    def test_o_teto_cobre_as_tentativas_da_ia(self):
        """
        Um teto menor que o tempo da IA declararia interrompida uma execucao
        que ainda roda - e o Reavaliar pagaria uma segunda chamada.
        """
        tempo_da_ia = settings.AI_GEMINI_TENTATIVAS * settings.AI_GEMINI_TIMEOUT_S

        self.assertGreater(settings.PREANALISE_TEMPO_MAXIMO_S, tempo_da_ia)
