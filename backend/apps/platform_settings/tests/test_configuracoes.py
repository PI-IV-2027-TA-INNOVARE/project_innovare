"""
Testes da configuracao administravel da plataforma.

Duas garantias: a leitura do tema e publica (a tela de login precisa pintar a
marca antes de existir JWT) e a gravacao e JSON Merge Patch restrito ao
Administrador - diff minimo, `null` remove, chave ausente preserva.

Nenhum toca banco remoto, SMTP real ou provedor de IA (AGENTS.md 0.1).
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Papel, Usuario
from apps.platform_settings.models import ConfiguracaoPlataforma

SENHA = 'Bioinsumo!2026'


class TemaBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse('configuracao-tema')

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

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def gravar(self, patch):
        return self.client.patch(self.url, patch, format='json')

    def ler(self):
        self.client.force_authenticate(user=None)
        return self.client.get(self.url)


class LeituraDoTemaTests(TemaBaseTests):
    def test_anonimo_le_o_tema(self):
        resposta = self.client.get(self.url)

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['payload'], {})
        self.assertEqual(resposta.data['revisao'], 0)

    def test_leitura_devolve_autor_e_revisao_do_que_foi_gravado(self):
        self.como(self.administrador)
        self.gravar({'light': {'accentPrimary': '#1B5E20'}})

        resposta = self.ler()

        self.assertEqual(resposta.data['payload'], {'light': {'accentPrimary': '#1B5E20'}})
        self.assertEqual(resposta.data['revisao'], 1)
        self.assertEqual(
            resposta.data['atualizado_por_nome'], 'Administracao da plataforma'
        )
        self.assertIsNotNone(resposta.data['atualizado_em'])


class GravacaoDoTemaTests(TemaBaseTests):
    def test_administrador_grava_e_incrementa_a_revisao(self):
        self.como(self.administrador)

        primeira = self.gravar({'light': {'accentPrimary': '#1B5E20'}})
        segunda = self.gravar({'dark': {'accentPrimary': '#81C784'}})

        self.assertEqual(primeira.status_code, status.HTTP_200_OK)
        self.assertEqual(primeira.data['revisao'], 1)
        self.assertEqual(segunda.data['revisao'], 2)

    def test_merge_nao_apaga_o_irmao_da_mesma_secao(self):
        """Chave ausente preserva o valor antigo - e o que o RFC 7396 manda."""
        self.como(self.administrador)

        self.gravar({'light': {'accentPrimary': '#1B5E20', 'bgCard': '#FFFFFF'}})
        self.gravar({'light': {'accentPrimary': '#2E7D32'}})

        self.assertEqual(
            self.ler().data['payload']['light'],
            {'accentPrimary': '#2E7D32', 'bgCard': '#FFFFFF'},
        )

    def test_null_remove_a_chave(self):
        """Token removido viaja como `null`: omitir seria nao apagar."""
        self.como(self.administrador)

        self.gravar({'light': {'accentPrimary': '#1B5E20', 'bgCard': '#FFFFFF'}})
        self.gravar({'light': {'accentPrimary': None}})

        self.assertEqual(self.ler().data['payload']['light'], {'bgCard': '#FFFFFF'})

    def test_gravacao_nao_mistura_os_dois_temas(self):
        self.como(self.administrador)

        self.gravar({'light': {'accentPrimary': '#1B5E20'}})
        self.gravar({'dark': {'accentPrimary': '#81C784'}})

        payload = self.ler().data['payload']

        self.assertEqual(payload['light'], {'accentPrimary': '#1B5E20'})
        self.assertEqual(payload['dark'], {'accentPrimary': '#81C784'})

    def test_supervisor_nao_grava(self):
        self.como(self.supervisor)

        resposta = self.gravar({'light': {'accentPrimary': '#000000'}})

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(ConfiguracaoPlataforma.objects.exists())

    def test_anonimo_nao_grava(self):
        resposta = self.gravar({'light': {'accentPrimary': '#000000'}})

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(ConfiguracaoPlataforma.objects.exists())

    def test_corpo_que_nao_e_objeto_e_recusado(self):
        self.como(self.administrador)

        resposta = self.client.patch(self.url, [1, 2], format='json')

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ConfiguracaoPlataforma.objects.exists())
