"""
Testes dos contatos de suporte.

A tela de acesso restrito e a mensagem de conta inativa apontam para quem
procurar. A lista precisa ser a mesma para todo mundo - gravada no navegador do
Administrador, ela so aparecia para ele.
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Papel, Usuario
from apps.audit.models import EventoAuditoria
from apps.platform_settings.models import ContatoSuporte
from apps.platform_settings.services.contatos import CONTATOS_PADRAO

SENHA = 'Bioinsumo!2026'

NOVOS = [
    {'nome': 'Pesquisa AC2', 'email': 'pesquisa@ac2microbiologia.com.br', 'papel': 'Rede'},
    {'nome': 'Suporte', 'email': 'suporte@ac2microbiologia.com.br', 'papel': ''},
]


class ContatosSuporteTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse('configuracao-contatos-suporte')
        self.administrador = Usuario.objects.create_user(
            email='admin@ac2microbiologia.com.br',
            nome='Administracao da plataforma',
            papel=Papel.ADMINISTRADOR,
            password=SENHA,
        )
        self.supervisor = Usuario.objects.create_user(
            email='supervisor@ac2microbiologia.com.br',
            nome='Rafael Antunes',
            papel=Papel.SUPERVISOR,
            password=SENHA,
        )

    def gravar(self, contatos, usuario=None):
        self.client.force_authenticate(user=usuario or self.administrador)
        return self.client.put(self.url, contatos, format='json')

    def ler(self):
        self.client.force_authenticate(user=None)
        return self.client.get(self.url)

    def test_sem_gravacao_todos_leem_o_padrao_da_ac2(self):
        """Inclusive sem login: a conta inativa tambem precisa de quem procurar."""
        resposta = self.ler()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data, [dict(contato) for contato in CONTATOS_PADRAO])

    def test_o_que_o_administrador_grava_vale_para_todos(self):
        self.assertEqual(self.gravar(NOVOS).status_code, status.HTTP_200_OK)

        self.assertEqual(self.ler().data, NOVOS)
        self.assertEqual(
            list(ContatoSuporte.objects.values_list('ordem', flat=True)), [0, 1]
        )

    def test_gravacao_entra_na_trilha(self):
        self.gravar(NOVOS)

        evento = EventoAuditoria.objects.get(tipo='contatos_suporte_alterados')
        self.assertEqual(evento.ator, self.administrador.email)
        self.assertEqual(
            evento.detalhe['emails'],
            ['pesquisa@ac2microbiologia.com.br', 'suporte@ac2microbiologia.com.br'],
        )

    def test_so_o_administrador_grava(self):
        resposta = self.gravar(NOVOS, usuario=self.supervisor)

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(ContatoSuporte.objects.exists())

    def test_recusa_lista_vazia(self):
        """Sem contato, quem foi barrado fica sem saida."""
        resposta = self.gravar([])

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_recusa_email_invalido_sem_apagar_o_que_havia(self):
        self.gravar(NOVOS)

        resposta = self.gravar([{'nome': 'X', 'email': 'pd-arroba-ac2', 'papel': ''}])

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.ler().data, NOVOS)

    def test_restaurar_volta_ao_padrao(self):
        self.gravar(NOVOS)
        self.client.force_authenticate(user=self.administrador)

        resposta = self.client.delete(self.url)

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ler().data, [dict(contato) for contato in CONTATOS_PADRAO])
        self.assertFalse(ContatoSuporte.objects.exists())

    def test_so_o_administrador_restaura(self):
        self.gravar(NOVOS)
        self.client.force_authenticate(user=self.supervisor)

        resposta = self.client.delete(self.url)

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(ContatoSuporte.objects.count(), 2)
