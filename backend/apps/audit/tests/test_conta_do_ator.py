"""
A trilha guarda quem agiu de dois jeitos: o texto (`ator`) e a conta (`id_ator`).

O texto e o que a tela sempre mostrou. A conta e o que deixa achar os eventos de
uma pessoa mesmo depois de o e-mail mudar, sem varrer a trilha inteira por texto.
Apagar a conta deixa o evento sem a ligacao, e o fato continua.

Nada toca banco remoto (AGENTS.md 0.1).
"""
import importlib
from datetime import timedelta

from django.apps import apps as registro_de_apps
from django.db import connection
from django.test import TestCase

from apps.audit.models import CategoriaEvento, EventoAuditoria
from apps.audit.services import registrar_evento
from apps.audit.services.registro import ATOR_SISTEMA
from core.tests.builders import UsuarioBuilder


def evento(ator):
    return registrar_evento(
        categoria=CategoriaEvento.CONTA,
        tipo='senha_alterada',
        entidade='usuario',
        entidade_id=1,
        ator=ator,
    )


class ContaDoAtorTests(TestCase):
    def setUp(self):
        self.pessoa = (
            UsuarioBuilder().pesquisador().com_email('joana@ac2.example').build()
        )

    def test_o_email_de_uma_conta_liga_o_evento_a_ela(self):
        registrado = evento('joana@ac2.example')

        self.assertEqual(registrado.conta_do_ator, self.pessoa)
        self.assertEqual(registrado.ator, 'joana@ac2.example')

    def test_a_propria_conta_tambem_liga_e_o_texto_e_o_email(self):
        """O texto e o e-mail, e nao o `str` da conta, que levaria o nome a trilha."""
        registrado = evento(self.pessoa)

        self.assertEqual(registrado.conta_do_ator, self.pessoa)
        self.assertEqual(registrado.ator, 'joana@ac2.example')

    def test_o_sistema_nao_e_conta(self):
        self.assertIsNone(evento(ATOR_SISTEMA).conta_do_ator)

    def test_email_sem_conta_fica_sem_ligacao(self):
        """A entrada recusada guarda o e-mail digitado, que pode nao ser de ninguem."""
        registrado = evento('ninguem@ac2.example')

        self.assertIsNone(registrado.conta_do_ator)
        self.assertEqual(registrado.ator, 'ninguem@ac2.example')

    def test_apagar_a_conta_tira_a_ligacao_e_guarda_o_fato(self):
        registrado = evento(self.pessoa.email)

        self.pessoa.delete()

        registrado.refresh_from_db()
        self.assertIsNone(registrado.conta_do_ator)
        self.assertEqual(registrado.tipo, 'senha_alterada')


class LigacaoDosEventosAntigosTests(TestCase):
    """
    A migration 0010 liga a trilha que ja existia, pelo e-mail no texto.

    A funcao e chamada direto, com o registro de apps: rodar a migration
    inteira desfaria o schema do banco de teste (`core/tests/test_migracoes.py`).
    """

    def setUp(self):
        self.pessoa = (
            UsuarioBuilder().pesquisador().com_email('joana@ac2.example').build()
        )

    def sem_ligacao(self, ator, **campos):
        registrado = evento(ator)
        EventoAuditoria.objects.filter(pk=registrado.pk).update(conta_do_ator=None, **campos)
        return registrado.pk

    def ligar(self):
        migration = importlib.import_module('apps.audit.migrations.0010_liga_eventos_as_contas')
        migration.ligar_eventos_as_contas(registro_de_apps, None)
        return dict(EventoAuditoria.objects.values_list('pk', 'conta_do_ator_id'))

    def test_liga_o_evento_feito_depois_da_criacao_da_conta(self):
        depois = self.sem_ligacao('joana@ac2.example')

        self.assertEqual(self.ligar()[depois], self.pessoa.pk)

    def test_nao_liga_o_evento_de_antes_da_conta_existir(self):
        """O e-mail pode ter sido de outra conta antes."""
        antes = self.sem_ligacao(
            'joana@ac2.example', ocorrido_em=self.pessoa.criado_em - timedelta(days=30)
        )

        self.assertIsNone(self.ligar()[antes])

    def test_nao_liga_o_sistema_nem_email_sem_conta(self):
        sistema = self.sem_ligacao(ATOR_SISTEMA)
        desconhecido = self.sem_ligacao('ninguem@ac2.example')

        ligados = self.ligar()

        self.assertIsNone(ligados[sistema])
        self.assertIsNone(ligados[desconhecido])

    def test_nao_mexe_no_evento_que_ja_tem_conta(self):
        outra = UsuarioBuilder().supervisor().com_email('rafael@ac2.example').build()
        registrado = evento('joana@ac2.example')
        EventoAuditoria.objects.filter(pk=registrado.pk).update(conta_do_ator=outra)

        self.assertEqual(self.ligar()[registrado.pk], outra.pk)


class IndiceDoPedidoDeExclusaoTests(TestCase):
    def test_o_pedido_de_exclusao_tem_indice_proprio(self):
        """A lista de Usuarios procura o pedido de cada conta na trilha inteira."""
        with connection.cursor() as cursor:
            restricoes = connection.introspection.get_constraints(
                cursor, EventoAuditoria._meta.db_table
            )

        self.assertIn('idx_evento_pedido_exclusao', restricoes)
        self.assertTrue(restricoes['idx_evento_pedido_exclusao']['index'])
