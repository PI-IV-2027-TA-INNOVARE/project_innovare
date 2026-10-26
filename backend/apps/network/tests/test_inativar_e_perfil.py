"""
Testes de inativar membro e dos campos do proprio perfil (P3, P10).

O que esta sob prova: inativo sai da rodada nova de matching e perde o login,
continua nas equipes ja geradas marcado como inativo, e reativar devolve as
duas coisas. No perfil, o Pesquisador edita os campos do RF03 e a API recusa o
que e cadastro do Supervisor.
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import SituacaoConta
from apps.audit.models import EventoAuditoria
from apps.matching.services import AdicionarMembroService, candidatos_da_rede, equipe_atual_de
from apps.matching.serializers import MembroEquipeSerializer
from apps.network.models import SituacaoMembro
from core.exceptions import ConflitoDeEstado
from core.tests.builders import (
    SENHA_PADRAO,
    MembroRedeBuilder,
    OportunidadeBuilder,
    UsuarioBuilder,
    indicar_na_equipe,
    titulacao,
)


class InativarBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.membro = (
            MembroRedeBuilder().pesquisador().chamado('Marina Alves').com_acesso().build()
        )
        self.client.force_authenticate(user=self.supervisor)

    def inativar(self, membro=None):
        return self.client.post(
            reverse('membro-rede-inativar', args=[(membro or self.membro).pk])
        )

    def reativar(self, membro=None):
        return self.client.post(
            reverse('membro-rede-reativar', args=[(membro or self.membro).pk])
        )

    def entrar(self):
        cliente = APIClient()
        return cliente.post(
            reverse('auth-token'),
            {'email': self.membro.usuario.email, 'password': SENHA_PADRAO},
            format='json',
        )


class InativarMembroTests(InativarBaseTests):
    def test_inativo_nao_entra_numa_rodada_nova(self):
        """SPEC-11: membro inativo nao aparece numa rodada nova."""
        self.inativar()

        self.assertNotIn(self.membro.pk, [membro.pk for membro in candidatos_da_rede()])

    def test_inativo_nao_consegue_entrar(self):
        """SPEC-11: membro inativo nao consegue entrar."""
        self.assertEqual(self.entrar().status_code, status.HTTP_200_OK)

        resposta = self.inativar()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['situacao'], SituacaoMembro.INATIVO)
        self.membro.usuario.refresh_from_db()
        self.assertEqual(self.membro.usuario.situacao, SituacaoConta.INATIVO)
        self.assertNotEqual(self.entrar().status_code, status.HTTP_200_OK)

    def test_equipe_antiga_mostra_o_membro_marcado_como_inativo(self):
        """SPEC-11: as equipes antigas continuam mostrando o membro."""
        oportunidade = OportunidadeBuilder().build()
        indicar_na_equipe(oportunidade, self.membro)

        self.inativar()

        indicacoes = MembroEquipeSerializer(
            equipe_atual_de(oportunidade).membros.all(), many=True
        ).data
        self.assertEqual([item['nome'] for item in indicacoes], ['Marina Alves'])
        self.assertTrue(indicacoes[0]['inativo'])

    def test_inativo_nao_entra_a_mao_numa_equipe(self):
        oportunidade = OportunidadeBuilder().build()
        indicar_na_equipe(oportunidade, MembroRedeBuilder().pesquisador().build())
        self.inativar()
        self.membro.refresh_from_db()

        with self.assertRaises(ConflitoDeEstado) as erro:
            AdicionarMembroService().execute(
                equipe=equipe_atual_de(oportunidade),
                membro_rede=self.membro,
                papel='pesquisador',
                ator=self.supervisor,
            )

        self.assertEqual(erro.exception.codigo, 'membro_inativo')

    def test_inativar_fica_na_trilha(self):
        self.inativar()

        evento = EventoAuditoria.objects.get(tipo='membro_inativado')
        self.assertEqual(evento.ator, self.supervisor.email)
        self.assertEqual(evento.entidade_id, str(self.membro.pk))

    def test_inativar_duas_vezes_e_recusado(self):
        self.inativar()

        self.assertEqual(self.inativar().status_code, status.HTTP_409_CONFLICT)

    def test_supervisor_nao_inativa_o_proprio_cadastro(self):
        proprio = MembroRedeBuilder().supervisor().com_acesso(self.supervisor).build()

        self.assertEqual(self.inativar(proprio).status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_o_supervisor_inativa(self):
        self.client.force_authenticate(user=UsuarioBuilder().pesquisador().build())

        self.assertEqual(self.inativar().status_code, status.HTTP_403_FORBIDDEN)


class ReativarMembroTests(InativarBaseTests):
    def test_reativar_devolve_o_matching_e_o_login(self):
        self.inativar()

        resposta = self.reativar()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['situacao'], SituacaoMembro.ATIVO)
        self.assertIn(self.membro.pk, [membro.pk for membro in candidatos_da_rede()])
        self.assertEqual(self.entrar().status_code, status.HTTP_200_OK)

    def test_quem_nunca_teve_conta_volta_sem_acesso(self):
        sem_conta = MembroRedeBuilder().pesquisador().build()
        self.inativar(sem_conta)

        resposta = self.reativar(sem_conta)

        self.assertEqual(resposta.data['situacao'], SituacaoMembro.SEM_ACESSO)

    def test_cadastro_anonimizado_nao_volta(self):
        administrador = UsuarioBuilder().administrador().build()
        self.client.force_authenticate(user=administrador)
        self.client.post(
            reverse('usuario-anonimizar', args=[self.membro.usuario.pk])
        )
        self.client.force_authenticate(user=self.supervisor)

        resposta = self.reativar()

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'conta_anonimizada')

    def test_reativar_quem_esta_ativo_e_recusado(self):
        self.assertEqual(self.reativar().status_code, status.HTTP_409_CONFLICT)


class CamposDoProprioPerfilTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.membro = (
            MembroRedeBuilder().pesquisador().chamado('Marina Alves').com_acesso().build()
        )
        self.client.force_authenticate(user=self.membro.usuario)

    def editar(self, corpo):
        return self.client.patch(reverse('rede-meu-perfil'), corpo, format='json')

    def test_pesquisador_edita_os_campos_do_rf03(self):
        titulacao('doutorado')

        resposta = self.editar(
            {
                'disponibilidade': 'integral',
                'experiencia': 'Dez anos em microbiologia de alimentos.',
                'competencias': ['Microbiologia de alimentos'],
                'tecnicas': ['PCR em tempo real'],
                'linhas': ['Seguranca de alimentos'],
                'titulacao_codigo': 'doutorado',
                'formacoes': [{'curso': 'Biologia', 'instituicao': 'FHO'}],
            }
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK, resposta.data)
        self.assertEqual(resposta.data['disponibilidade'], 'integral')

    def test_api_recusa_campo_travado(self):
        """SPEC-11: a API recusa a edicao de campo travado feita pelo Pesquisador."""
        for campo, valor in (
            ('nome', 'Outro nome'),
            ('email', 'outro@ac2microbiologia.com.br'),
            ('papel_rede', 'supervisor'),
            ('organizacao', None),
            ('situacao', 'ativo'),
        ):
            resposta = self.editar({campo: valor, 'disponibilidade': 'integral'})

            self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST, campo)
            self.assertIn(campo, resposta.data)

        self.membro.refresh_from_db()
        self.assertEqual(self.membro.nome, 'Marina Alves')
        self.assertEqual(self.membro.disponibilidade, 'parcial')
