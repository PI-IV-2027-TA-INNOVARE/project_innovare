"""
As sessoes vencidas saem do banco, e encerrar as abertas custa pouco.

Cada renovacao de sessao grava uma linha, e nada as apagava: a tabela so
crescia. Encerrar as sessoes de uma pessoa percorria todas essas linhas, uma
consulta por linha, inclusive as que ja nao valiam.
"""
from datetime import timedelta

from django.conf import settings
from django.test import TestCase
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.services.acesso import encerrar_sessoes
from apps.accounts.tasks import limpar_sessoes_vencidas
from core.tests.builders import UsuarioBuilder


class SessoesVencidasTests(TestCase):
    def setUp(self):
        self.usuario = UsuarioBuilder().supervisor().build()

    def abrir_sessao(self, usuario=None):
        token = RefreshToken.for_user(usuario or self.usuario)
        return OutstandingToken.objects.get(jti=token['jti'])

    def vencer(self, sessao):
        sessao.expires_at = timezone.now() - timedelta(days=1)
        sessao.save(update_fields=['expires_at'])
        return sessao

    def test_encerrar_as_sessoes_barra_as_que_ainda_valem(self):
        aberta = self.abrir_sessao()
        vencida = self.vencer(self.abrir_sessao())

        encerrar_sessoes(self.usuario)

        self.assertTrue(BlacklistedToken.objects.filter(token=aberta).exists())
        self.assertFalse(BlacklistedToken.objects.filter(token=vencida).exists())

    def test_encerrar_duas_vezes_nao_duplica_nem_falha(self):
        self.abrir_sessao()

        encerrar_sessoes(self.usuario)
        encerrar_sessoes(self.usuario)

        self.assertEqual(BlacklistedToken.objects.count(), 1)

    def test_encerrar_nao_toca_nas_sessoes_de_outra_pessoa(self):
        de_outra = self.abrir_sessao(UsuarioBuilder().supervisor().build())

        encerrar_sessoes(self.usuario)

        self.assertFalse(BlacklistedToken.objects.filter(token=de_outra).exists())

    def test_o_custo_de_encerrar_nao_cresce_com_o_numero_de_sessoes(self):
        for _ in range(12):
            self.abrir_sessao()

        with self.assertNumQueries(2):
            encerrar_sessoes(self.usuario)

    def test_a_limpeza_apaga_as_vencidas_e_mantem_as_abertas(self):
        aberta = self.abrir_sessao()
        vencida = self.vencer(self.abrir_sessao())
        BlacklistedToken.objects.create(token=vencida)

        limpar_sessoes_vencidas()

        self.assertTrue(OutstandingToken.objects.filter(pk=aberta.pk).exists())
        self.assertFalse(OutstandingToken.objects.filter(pk=vencida.pk).exists())
        self.assertEqual(BlacklistedToken.objects.count(), 0)

    def test_a_limpeza_esta_agendada(self):
        agendadas = {
            tarefa['task'] for tarefa in settings.CELERY_BEAT_SCHEDULE.values()
        }

        self.assertIn('accounts.limpar_sessoes_vencidas', agendadas)
