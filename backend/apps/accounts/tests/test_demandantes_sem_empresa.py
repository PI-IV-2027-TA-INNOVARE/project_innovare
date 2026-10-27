"""A consulta que conta, antes do deploy, os Demandantes ainda sem empresa."""
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from core.tests.builders import OrganizacaoBuilder, UsuarioBuilder


class DemandantesSemEmpresaTests(TestCase):
    def test_conta_so_os_demandantes_sem_empresa(self):
        sem_empresa = UsuarioBuilder().demandante().build()
        UsuarioBuilder().demandante().na_organizacao(
            OrganizacaoBuilder().demandante().build()
        ).build()
        UsuarioBuilder().supervisor().build()

        saida = StringIO()
        call_command('demandantes_sem_empresa', stdout=saida)

        self.assertIn('Demandantes sem empresa vinculada: 1', saida.getvalue())
        self.assertIn(f'conta {sem_empresa.id_usuario}', saida.getvalue())

    def test_nao_imprime_nome_nem_email(self):
        UsuarioBuilder().demandante().chamado('Empresa Sigilosa').com_email(
            'contato@sigilosa.example'
        ).build()

        saida = StringIO()
        call_command('demandantes_sem_empresa', stdout=saida)

        self.assertNotIn('Sigilosa', saida.getvalue())
        self.assertNotIn('@', saida.getvalue())
