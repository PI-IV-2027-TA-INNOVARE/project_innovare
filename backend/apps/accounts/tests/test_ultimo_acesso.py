"""
O ultimo acesso acompanha o uso da sessao, nao so a entrada com senha.

A sessao se renova sozinha: o token de acesso dura 30 minutos e o de renovacao
gira a cada uso. So a entrada com senha carimbava `ultimo_acesso`, e o
Administrador logado havia quatro dias via "Ha 4 dias" na propria linha da
tabela de usuarios.
"""
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Papel, Usuario
from apps.audit.models import EventoAuditoria

SENHA = 'Senha-Forte-2026!'


class UltimoAcessoNaRenovacaoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.usuario = Usuario.objects.create_user(
            email='admin@ac2.example',
            nome='Administracao da plataforma',
            papel=Papel.ADMINISTRADOR,
            password=SENHA,
        )

    def entrar(self):
        resposta = self.client.post(
            reverse('auth-token'),
            {'email': self.usuario.email, 'password': SENHA},
            format='json',
        )
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)

    def renovar(self):
        return self.client.post(reverse('auth-token-refresh'), {}, format='json')

    def carimbar(self, quando):
        Usuario.objects.filter(pk=self.usuario.pk).update(ultimo_acesso=quando)

    def test_renovar_a_sessao_atualiza_o_ultimo_acesso(self):
        self.entrar()
        self.carimbar(timezone.now() - timedelta(days=4))

        resposta = self.renovar()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.usuario.refresh_from_db()
        self.assertGreater(self.usuario.ultimo_acesso, timezone.now() - timedelta(minutes=1))

    def test_renovar_nao_vira_nova_entrada_na_trilha(self):
        self.entrar()
        self.carimbar(timezone.now() - timedelta(days=4))
        entradas = EventoAuditoria.objects.filter(tipo='login').count()

        self.renovar()

        self.assertEqual(EventoAuditoria.objects.filter(tipo='login').count(), entradas)

    def test_renovacoes_seguidas_nao_regravam_a_cada_vez(self):
        self.entrar()
        recente = timezone.now() - timedelta(minutes=2)
        self.carimbar(recente)

        self.renovar()

        self.usuario.refresh_from_db()
        self.assertEqual(self.usuario.ultimo_acesso, recente)

    def test_renovacao_recusada_nao_mexe_no_ultimo_acesso(self):
        antigo = timezone.now() - timedelta(days=4)
        self.carimbar(antigo)

        resposta = self.renovar()

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)
        self.usuario.refresh_from_db()
        self.assertEqual(self.usuario.ultimo_acesso, antigo)
