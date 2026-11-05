"""
Pre-analise na fila (SPEC-14).

A fila e opt-in: com `PREANALISE_ASSINCRONA=True` e um broker configurado, o
POST cria a linha pendente e devolve 202; o worker processa a mesma linha. Sem
fila, o caminho sincrono continua sendo o padrao.

Nenhum teste toca Redis: o enfileiramento e um mock e o worker e chamado como
funcao, com provedor duble (AGENTS.md 0.1).
"""
from unittest.mock import patch

from django.test import override_settings
from rest_framework import status

from apps.ai.models import StatusExecucao
from apps.maturity.models import PreAnalise
from apps.maturity.services import PreAnalisarService
from apps.maturity.tasks import pre_analisar
from apps.maturity.tests.test_preanalise import PreAnaliseBaseTests
from core.tests.dubles import ProvedorFake


class PreAnaliseAssincronaTests(PreAnaliseBaseTests):
    def test_post_com_fila_cria_pendente_e_nao_chama_o_provedor(self):
        self.importar_criterios()

        with override_settings(
            PREANALISE_ASSINCRONA=True, CELERY_BROKER_URL='memory://'
        ):
            with patch('apps.maturity.tasks.pre_analisar.delay') as enfileirar:
                resposta = self.client.post(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_202_ACCEPTED)
        analise = PreAnalise.objects.get()
        self.assertEqual(analise.status, StatusExecucao.PENDENTE)
        enfileirar.assert_called_once_with(
            str(analise.id_pre_analise), str(self.supervisor.pk)
        )

    def test_o_worker_processa_a_linha_pendente(self):
        self.importar_criterios()
        analise = PreAnalisarService(provedor=ProvedorFake()).preparar(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

        with patch.object(
            PreAnalisarService, '_resolver_provedor', return_value=ProvedorFake()
        ):
            pre_analisar(str(analise.id_pre_analise), str(self.supervisor.pk))

        analise.refresh_from_db()
        self.assertEqual(analise.status, StatusExecucao.OK)
        self.assertTrue(analise.dimensoes.exists())

    def test_worker_nao_reprocessa_uma_linha_ja_concluida(self):
        self.importar_criterios()
        analise = PreAnalisarService(provedor=ProvedorFake()).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )
        dimensoes = analise.dimensoes.count()

        with patch.object(PreAnalisarService, '_resolver_provedor') as resolver:
            pre_analisar(str(analise.id_pre_analise), str(self.supervisor.pk))

        resolver.assert_not_called()
        self.assertEqual(analise.dimensoes.count(), dimensoes)

    def test_falha_ao_enfileirar_marca_a_execucao_com_erro(self):
        self.importar_criterios()

        with override_settings(
            PREANALISE_ASSINCRONA=True, CELERY_BROKER_URL='memory://'
        ):
            with patch(
                'apps.maturity.tasks.pre_analisar.delay',
                side_effect=RuntimeError('broker fora'),
            ):
                resposta = self.client.post(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        analise = PreAnalise.objects.get()
        self.assertEqual(analise.status, StatusExecucao.ERRO)
        self.assertEqual(analise.erro, 'fila_indisponivel')
