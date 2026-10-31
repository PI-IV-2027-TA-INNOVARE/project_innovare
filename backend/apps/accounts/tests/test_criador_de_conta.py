"""
A criacao de conta por papel como Factory Method (Padroes de Projeto §4.1).

O servico de provisionamento decidia pelo papel em tres pontos. Agora cada
papel que o Administrador provisiona tem o seu criador, e a regra RN-A04 (o
Pesquisador nasce da rede interna, pelo Supervisor) fica num lugar so.
"""
from django.test import TestCase

from apps.accounts.models import DemandanteExterno, Papel, Usuario
from apps.accounts.services.criadores import (
    CriadorDeAdministrador,
    CriadorDeDemandante,
    CriadorDeSupervisor,
    criador_de_conta,
)
from apps.network.models import MembroRede, PapelNaRede
from core.exceptions import ErroDeDominio
from core.tests.builders import UsuarioBuilder

CNPJ_VALIDO = '11222333000181'


class FabricaDeCriadoresTests(TestCase):
    def test_cada_papel_provisionavel_tem_o_seu_criador(self):
        self.assertIsInstance(criador_de_conta(Papel.DEMANDANTE), CriadorDeDemandante)
        self.assertIsInstance(criador_de_conta(Papel.SUPERVISOR), CriadorDeSupervisor)
        self.assertIsInstance(criador_de_conta(Papel.ADMINISTRADOR), CriadorDeAdministrador)

    def test_pesquisador_nao_e_provisionado_pelo_administrador(self):
        with self.assertRaises(ErroDeDominio) as erro:
            criador_de_conta(Papel.PESQUISADOR)

        self.assertEqual(erro.exception.codigo, 'papel_nao_provisionavel')

    def test_papel_desconhecido_tambem_e_recusado(self):
        with self.assertRaises(ErroDeDominio) as erro:
            criador_de_conta('visitante')

        self.assertEqual(erro.exception.codigo, 'papel_nao_provisionavel')


class CriadoresTests(TestCase):
    def setUp(self):
        self.administrador = UsuarioBuilder().administrador().build()

    def conta(self, papel, organizacao=None, nome='Ana Souza'):
        return Usuario.objects.create_user(
            email=f'{papel}@ac2microbiologia.com.br', nome=nome, papel=papel, organizacao=organizacao
        )

    def test_demandante_sem_cnpj_e_recusado(self):
        with self.assertRaises(ErroDeDominio) as erro:
            criador_de_conta(Papel.DEMANDANTE).preparar(
                nome='Ana Souza', organizacao=None, cnpj=None, nome_empresa=''
            )

        self.assertEqual(erro.exception.codigo, 'demandante_sem_empresa')

    def test_demandante_entra_com_a_empresa_e_o_nome_dela(self):
        nome, organizacao = criador_de_conta(Papel.DEMANDANTE).preparar(
            nome='Ana Souza', organizacao=None, cnpj=CNPJ_VALIDO, nome_empresa='Vale Verde'
        )

        self.assertEqual(nome, 'Vale Verde')
        self.assertEqual(organizacao.cnpj, CNPJ_VALIDO)

    def test_demandante_ganha_o_perfil_de_demandante(self):
        criador = criador_de_conta(Papel.DEMANDANTE)
        nome, organizacao = criador.preparar(
            nome='Ana', organizacao=None, cnpj=CNPJ_VALIDO, nome_empresa='Vale Verde'
        )
        usuario = self.conta(Papel.DEMANDANTE, organizacao, nome)

        criador.completar(usuario=usuario, organizacao=organizacao, ator=self.administrador)

        self.assertTrue(DemandanteExterno.objects.filter(usuario=usuario).exists())

    def test_supervisor_entra_na_rede_interna(self):
        usuario = self.conta(Papel.SUPERVISOR)

        criador_de_conta(Papel.SUPERVISOR).completar(
            usuario=usuario, organizacao=None, ator=self.administrador
        )

        membro = MembroRede.objects.get(usuario=usuario)
        self.assertEqual(membro.papel_rede, PapelNaRede.SUPERVISOR)

    def test_administrador_nao_ganha_perfil_nem_lugar_na_rede(self):
        usuario = self.conta(Papel.ADMINISTRADOR)

        criador_de_conta(Papel.ADMINISTRADOR).completar(
            usuario=usuario, organizacao=None, ator=self.administrador
        )

        self.assertFalse(DemandanteExterno.objects.filter(usuario=usuario).exists())
        self.assertFalse(MembroRede.objects.filter(usuario=usuario).exists())
