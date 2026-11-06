"""
A tentativa de entrada que nao passou fica na trilha.

Sem isto, senha errada em serie nao deixava rastro: a tela de Auditoria, a
retencao e o `CONTEXT.md` falavam de "Entrada recusada", mas nada a gravava.

Nenhum destes testes toca banco remoto, SMTP real ou provedor de IA
(AGENTS.md 0.1).
"""
import json

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import SituacaoConta
from apps.audit.models import EventoAuditoria, StatusEvento
from core.tests.builders import UsuarioBuilder

SENHA = 'Bioinsumo!2026'


class EntradaRecusadaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.usuario = (
            UsuarioBuilder().supervisor().com_email('rafael@ac2.com.br').com_senha(SENHA).build()
        )

    def entrar(self, **corpo):
        return self.client.post(reverse('auth-token'), corpo, format='json')

    def recusa(self):
        return EventoAuditoria.objects.get(tipo='login_recusado')

    def test_senha_errada_fica_na_trilha_ligada_a_conta(self):
        resposta = self.entrar(email='rafael@ac2.com.br', password='senha-errada')

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)

        evento = self.recusa()
        self.assertEqual(evento.categoria, 'conta')
        self.assertEqual(evento.status, StatusEvento.NEGADO)
        self.assertEqual(evento.ator, 'rafael@ac2.com.br')
        self.assertEqual(evento.conta_do_ator, self.usuario)
        self.assertEqual(evento.entidade, 'usuario')
        self.assertEqual(evento.entidade_id, str(self.usuario.pk))
        self.assertEqual(evento.motivo, 'Senha incorreta.')

    def test_o_email_e_lido_como_no_login(self):
        self.entrar(email='  RAFAEL@AC2.COM.BR ', password='senha-errada')

        self.assertEqual(self.recusa().conta_do_ator, self.usuario)

    def test_email_sem_conta_fica_na_trilha_sem_conta_ligada(self):
        resposta = self.entrar(email='Ninguem@Exemplo.com.br', password='qualquer')

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)

        evento = self.recusa()
        self.assertEqual(evento.ator, 'ninguem@exemplo.com.br')
        self.assertIsNone(evento.conta_do_ator)
        self.assertEqual(evento.entidade_id, 'desconhecido')
        self.assertEqual(evento.motivo, 'E-mail sem conta correspondente.')

    def test_conta_suspensa_diz_o_motivo_mesmo_com_a_senha_certa(self):
        self.usuario.situacao = SituacaoConta.SUSPENSO
        self.usuario.save(update_fields=['situacao'])

        self.entrar(email='rafael@ac2.com.br', password=SENHA)

        self.assertEqual(self.recusa().motivo, 'Situação da conta: Suspenso.')

    def test_o_formulario_nao_revela_quais_emails_estao_cadastrados(self):
        com_conta = self.entrar(email='rafael@ac2.com.br', password='senha-errada')
        sem_conta = self.entrar(email='ninguem@exemplo.com.br', password='senha-errada')

        self.assertEqual(com_conta.status_code, sem_conta.status_code)
        self.assertEqual(com_conta.data, sem_conta.data)

    def test_a_senha_digitada_nunca_vai_para_a_trilha(self):
        self.entrar(email='rafael@ac2.com.br', password='Segredo!123')

        evento = EventoAuditoria.objects.filter(tipo='login_recusado').values().get()

        self.assertNotIn('Segredo!123', json.dumps(evento, default=str))

    def test_senha_digitada_no_campo_de_email_nao_vai_para_a_trilha(self):
        resposta = self.entrar(email='Segredo!123', password='qualquer')

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)

        evento = EventoAuditoria.objects.filter(tipo='login_recusado').values().get()

        self.assertEqual(evento['ator'], 'não identificado')
        self.assertNotIn('segredo!123', json.dumps(evento, default=str).lower())

    def test_valor_maior_que_a_coluna_nao_derruba_o_login(self):
        resposta = self.entrar(email='a' * 200 + '@exemplo.com.br', password='qualquer')

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.recusa().ator, 'não identificado')

    def test_numero_no_campo_de_email_nao_derruba_o_login(self):
        resposta = self.entrar(email=12345, password='qualquer')

        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.recusa().ator, 'não identificado')

    def test_pedido_incompleto_nao_e_tentativa_de_entrada(self):
        resposta = self.entrar(email='rafael@ac2.com.br')

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(EventoAuditoria.objects.filter(tipo='login_recusado').exists())
