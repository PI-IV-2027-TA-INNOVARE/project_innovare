"""
Testes dos builders de teste.

Helper de teste tambem quebra - e quando quebra, quebra calado, com um monte de
teste falhando por um motivo que nao e o dele. Estes casos travam o contrato dos
builders: padrao valido, unicidade do que o banco exige unico e as invariantes
de origem que as `CheckConstraint` cobram.
"""
from django.test import TestCase

from apps.accounts.models import Papel, SituacaoConta
from apps.network.models import PapelNaRede, SituacaoMembro, TipoCompetencia
from apps.opportunities.models import OrigemOportunidade, SituacaoOportunidade
from apps.organizations.models import TipoOrganizacao
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
    titulacao,
)


class UsuarioBuilderTests(TestCase):
    def test_padrao_e_supervisor_ativo_com_senha(self):
        usuario = UsuarioBuilder().build()

        self.assertEqual(usuario.papel, Papel.SUPERVISOR)
        self.assertEqual(usuario.situacao, SituacaoConta.ATIVO)
        self.assertTrue(usuario.has_usable_password())

    def test_cada_build_gera_email_proprio(self):
        primeiro = UsuarioBuilder().build()
        segundo = UsuarioBuilder().build()

        self.assertNotEqual(primeiro.email, segundo.email)

    def test_papel_e_situacao_sao_declaraveis(self):
        usuario = UsuarioBuilder().demandante().inativo().build()

        self.assertEqual(usuario.papel, Papel.DEMANDANTE)
        self.assertEqual(usuario.situacao, SituacaoConta.INATIVO)

    def test_conta_provisionada_nasce_sem_senha_utilizavel(self):
        usuario = UsuarioBuilder().sem_senha_utilizavel().build()

        self.assertFalse(usuario.has_usable_password())

    def test_operador_do_django_entra_no_admin(self):
        usuario = UsuarioBuilder().operador_do_django().build()

        self.assertTrue(usuario.is_staff)
        self.assertTrue(usuario.is_superuser)


class OrganizacaoBuilderTests(TestCase):
    def test_demandante_nasce_com_cnpj(self):
        organizacao = OrganizacaoBuilder().demandante().build()

        self.assertEqual(organizacao.tipo, TipoOrganizacao.DEMANDANTE)
        self.assertIsNotNone(organizacao.cnpj)

    def test_instituicao_dispensa_cnpj(self):
        organizacao = OrganizacaoBuilder().instituicao().build()

        self.assertIsNone(organizacao.cnpj)

    def test_cnpj_nao_se_repete_entre_builds(self):
        primeira = OrganizacaoBuilder().demandante().build()
        segunda = OrganizacaoBuilder().demandante().build()

        self.assertNotEqual(primeira.cnpj, segunda.cnpj)


class MembroRedeBuilderTests(TestCase):
    def test_padrao_e_pesquisador_sem_acesso(self):
        membro = MembroRedeBuilder().build()

        self.assertEqual(membro.papel_rede, PapelNaRede.PESQUISADOR)
        self.assertEqual(membro.situacao, SituacaoMembro.SEM_ACESSO)
        self.assertIsNone(membro.usuario)

    def test_com_acesso_liga_conta_e_ativa(self):
        membro = MembroRedeBuilder().supervisor().com_acesso().build()

        self.assertIsNotNone(membro.usuario)
        self.assertEqual(membro.usuario.papel, Papel.SUPERVISOR)
        self.assertEqual(membro.situacao, SituacaoMembro.ATIVO)

    def test_as_tres_listas_viram_competencias_do_tipo_certo(self):
        membro = (
            MembroRedeBuilder()
            .com_competencia('Microbiologia')
            .com_tecnica('Sequenciamento')
            .com_linha_de_pesquisa('Bioinsumos')
            .build()
        )

        tipos = {
            vinculo.competencia.nome: vinculo.competencia.tipo
            for vinculo in membro.vinculos_competencia.select_related('competencia')
        }

        self.assertEqual(tipos['Microbiologia'], TipoCompetencia.COMPETENCIA)
        self.assertEqual(tipos['Sequenciamento'], TipoCompetencia.TECNICA)
        self.assertEqual(tipos['Bioinsumos'], TipoCompetencia.LINHA_PESQUISA)

    def test_titulacao_vem_do_vocabulario_controlado(self):
        membro = MembroRedeBuilder().com_titulacao('mestrado').build()

        self.assertEqual(membro.titulacao.codigo, 'mestrado')
        self.assertEqual(membro.titulacao.nivel, 3)

    def test_titulacao_repetida_nao_duplica_o_vocabulario(self):
        primeira = titulacao('doutorado')
        segunda = titulacao('doutorado')

        self.assertEqual(primeira.pk, segunda.pk)


class OportunidadeBuilderTests(TestCase):
    def test_padrao_e_ideia_interna_em_entrada(self):
        oportunidade = OportunidadeBuilder().build()

        self.assertEqual(oportunidade.origem, OrigemOportunidade.INTERNA)
        self.assertEqual(oportunidade.situacao, SituacaoOportunidade.ENTRADA)
        self.assertIsNone(oportunidade.demandante)

    def test_externa_nasce_com_demandante(self):
        oportunidade = OportunidadeBuilder().externa().build()

        self.assertEqual(oportunidade.origem, OrigemOportunidade.EXTERNO)
        self.assertIsNotNone(oportunidade.demandante)

    def test_codigo_sai_da_sequencia_e_nao_se_repete(self):
        primeira = OportunidadeBuilder().build()
        segunda = OportunidadeBuilder().build()

        self.assertRegex(primeira.codigo, r'^OP-\d{4}-\d{3}$')
        self.assertNotEqual(primeira.codigo, segunda.codigo)

    def test_conducao_e_situacao_sao_declaraveis(self):
        membro = MembroRedeBuilder().supervisor().com_acesso().build()

        oportunidade = (
            OportunidadeBuilder()
            .intitulada('Bioinsumo para cana')
            .conduzida_por(membro)
            .aguardando_decisao()
            .build()
        )

        self.assertEqual(oportunidade.titulo, 'Bioinsumo para cana')
        self.assertEqual(oportunidade.responsavel, membro)
        self.assertEqual(oportunidade.situacao, SituacaoOportunidade.AGUARDANDO_DECISAO)
