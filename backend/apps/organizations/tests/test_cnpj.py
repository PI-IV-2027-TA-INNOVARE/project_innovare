"""
Conferencia do CNPJ na fronteira.

O cadastro do Demandante Externo pede o CNPJ da empresa. Ele e conferido aqui,
pelos digitos verificadores, sem consulta a servico externo (AGENTS.md 0.1).
"""
from django.test import SimpleTestCase

from apps.organizations.cnpj import cnpj_valido, formatar_cnpj, somente_digitos


class CnpjTests(SimpleTestCase):
    def test_aceita_cnpj_com_mascara(self):
        self.assertTrue(cnpj_valido('11.222.333/0001-81'))

    def test_aceita_cnpj_so_com_digitos(self):
        self.assertTrue(cnpj_valido('11444777000161'))

    def test_recusa_digito_verificador_errado(self):
        self.assertFalse(cnpj_valido('11.222.333/0001-80'))

    def test_recusa_tamanho_errado(self):
        self.assertFalse(cnpj_valido('11.222.333/0001'))

    def test_recusa_digitos_todos_iguais(self):
        self.assertFalse(cnpj_valido('00.000.000/0000-00'))
        self.assertFalse(cnpj_valido('11111111111111'))

    def test_recusa_vazio(self):
        self.assertFalse(cnpj_valido(''))
        self.assertFalse(cnpj_valido(None))

    def test_guarda_so_os_digitos(self):
        self.assertEqual(somente_digitos('11.222.333/0001-81'), '11222333000181')

    def test_formata_para_a_tela(self):
        self.assertEqual(formatar_cnpj('11222333000181'), '11.222.333/0001-81')
