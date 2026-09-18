"""
Testes da rede interna: cadastro, consulta, liberacao de acesso e perfil.

Nenhum toca banco remoto, SMTP real ou provedor de IA (AGENTS.md 0.1).
"""
from django.core import mail
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Papel, SituacaoConta, Usuario
from apps.audit.models import EventoAuditoria
from apps.network.models import (
    DeclaradoPor,
    MembroRede,
    PapelNaRede,
    SituacaoMembro,
    TipoCompetencia,
    Titulacao,
)

SENHA = 'Bioinsumo!2026'


class RedeBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.supervisor = Usuario.objects.create_user(
            email='supervisor@ac2microbiologia.com.br',
            nome='Rafael Antunes',
            papel=Papel.SUPERVISOR,
            password=SENHA,
        )
        self.pesquisador = Usuario.objects.create_user(
            email='pesquisador@ac2microbiologia.com.br',
            nome='Maria Ferreira',
            papel=Papel.PESQUISADOR,
            password=SENHA,
        )
        self.administrador = Usuario.objects.create_user(
            email='admin@ac2microbiologia.com.br',
            nome='Administracao',
            papel=Papel.ADMINISTRADOR,
            password=SENHA,
        )
        self.mestrado = Titulacao.objects.create(
            codigo='mestrado', rotulo='Mestrado', nivel=3
        )

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def cadastrar(self, **extra):
        corpo = {
            'nome': 'Helena Torres',
            'email': 'Helena.Torres@ac2microbiologia.com.br',
            'papel_rede': PapelNaRede.PESQUISADOR,
            'titulacao_codigo': 'mestrado',
            'competencias': ['Bioinformática', 'Bioinformática'],
            'tecnicas': ['PCR em tempo real'],
            'linhas': ['Bioinsumos agrícolas'],
        }
        corpo.update(extra)
        return self.client.post(reverse('membro-rede-list'), corpo, format='json')


class CadastroDeMembroTests(RedeBaseTests):
    def test_supervisor_cadastra_e_a_pessoa_nasce_sem_acesso(self):
        self.como(self.supervisor)
        resposta = self.cadastrar()

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resposta.data['situacao'], SituacaoMembro.SEM_ACESSO)
        self.assertFalse(resposta.data['tem_acesso'])

        membro = MembroRede.objects.get(email='helena.torres@ac2microbiologia.com.br')
        self.assertIsNone(membro.usuario_id)
        self.assertEqual(membro.cadastrado_por, self.supervisor)

    def test_as_tres_listas_viram_competencias_do_tipo_certo(self):
        self.como(self.supervisor)
        resposta = self.cadastrar()

        self.assertEqual(resposta.data['competencias'], ['Bioinformática'])
        self.assertEqual(resposta.data['tecnicas'], ['PCR em tempo real'])
        self.assertEqual(resposta.data['linhas'], ['Bioinsumos agrícolas'])

        membro = MembroRede.objects.get(email='helena.torres@ac2microbiologia.com.br')
        tipos = {
            v.competencia.tipo for v in membro.vinculos_competencia.all()
        }
        self.assertEqual(
            tipos,
            {
                TipoCompetencia.COMPETENCIA,
                TipoCompetencia.TECNICA,
                TipoCompetencia.LINHA_PESQUISA,
            },
        )

    def test_email_duplicado_na_rede_e_conflito(self):
        self.como(self.supervisor)
        self.cadastrar()
        resposta = self.cadastrar()

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'email_duplicado')

    def test_cadastro_deixa_evento_na_trilha(self):
        self.como(self.supervisor)
        self.cadastrar()

        self.assertTrue(
            EventoAuditoria.objects.filter(
                categoria='rede', tipo='membro_cadastrado'
            ).exists()
        )

    def test_so_o_supervisor_cadastra(self):
        for usuario in (self.pesquisador, self.administrador):
            self.como(usuario)
            self.assertEqual(
                self.cadastrar().status_code, status.HTTP_403_FORBIDDEN
            )

    def test_demandante_nao_consulta_a_rede(self):
        demandante = Usuario.objects.create_user(
            email='demandante@valeverde.com.br',
            nome='Agroindustria Vale Verde',
            papel=Papel.DEMANDANTE,
            password=SENHA,
        )
        self.como(demandante)

        resposta = self.client.get(reverse('membro-rede-list'))
        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_pesquisador_consulta_mas_nao_edita(self):
        self.como(self.supervisor)
        criado = self.cadastrar()
        membro_id = criado.data['id_membro']

        self.como(self.pesquisador)
        self.assertEqual(
            self.client.get(reverse('membro-rede-list')).status_code,
            status.HTTP_200_OK,
        )
        resposta = self.client.patch(
            reverse('membro-rede-detail', args=[membro_id]),
            {'experiencia': 'editado por quem nao pode'},
            format='json',
        )
        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_busca_alcanca_competencia_e_nao_so_nome(self):
        self.como(self.supervisor)
        self.cadastrar()

        resposta = self.client.get(reverse('membro-rede-list'), {'busca': 'bioinform'})
        self.assertEqual(resposta.data['count'], 1)


class LiberacaoDeAcessoTests(RedeBaseTests):
    def setUp(self):
        super().setUp()
        self.como(self.supervisor)
        self.membro_id = self.cadastrar().data['id_membro']
        mail.outbox = []

    def url(self):
        return reverse('membro-rede-liberar-acesso', args=[self.membro_id])

    def test_liberar_cria_conta_ativa_sem_senha_utilizavel(self):
        resposta = self.client.post(self.url(), {}, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertTrue(resposta.data['tem_acesso'])
        self.assertEqual(resposta.data['situacao'], SituacaoMembro.ATIVO)

        usuario = Usuario.objects.get(email='helena.torres@ac2microbiologia.com.br')
        self.assertEqual(usuario.papel, Papel.PESQUISADOR)
        self.assertEqual(usuario.situacao, SituacaoConta.ATIVO)
        self.assertFalse(usuario.has_usable_password())

    def test_liberar_envia_convite_de_primeiro_acesso(self):
        self.client.post(self.url(), {}, format='json')
        self.assertEqual(len(mail.outbox), 1)

    def test_liberar_duas_vezes_e_conflito(self):
        self.client.post(self.url(), {}, format='json')
        resposta = self.client.post(self.url(), {}, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'acesso_ja_liberado')

    def test_email_ja_usado_por_outra_conta_e_conflito(self):
        Usuario.objects.create_user(
            email='helena.torres@ac2microbiologia.com.br',
            nome='Conta anterior',
            papel=Papel.PESQUISADOR,
        )
        resposta = self.client.post(self.url(), {}, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'email_em_uso')

    def test_so_o_supervisor_libera(self):
        self.como(self.administrador)
        self.assertEqual(
            self.client.post(self.url(), {}, format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )


class PerfilProprioTests(RedeBaseTests):
    def setUp(self):
        super().setUp()
        self.membro = MembroRede.objects.create(
            usuario=self.pesquisador,
            nome='Maria Ferreira',
            email=self.pesquisador.email,
            papel_rede=PapelNaRede.PESQUISADOR,
            situacao=SituacaoMembro.ATIVO,
        )

    def test_pesquisador_le_e_edita_o_proprio_perfil(self):
        self.como(self.pesquisador)

        leitura = self.client.get(reverse('rede-meu-perfil'))
        self.assertEqual(leitura.status_code, status.HTTP_200_OK)
        self.assertEqual(leitura.data['nome'], 'Maria Ferreira')

        resposta = self.client.patch(
            reverse('rede-meu-perfil'),
            {
                'experiencia': 'Oito anos em microbiologia de alimentos.',
                'disponibilidade': 'integral',
                'competencias': ['Fermentação'],
            },
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['competencias'], ['Fermentação'])
        self.assertEqual(resposta.data['disponibilidade'], 'integral')

    def test_competencia_declarada_pelo_proprio_membro_fica_marcada(self):
        self.como(self.pesquisador)
        self.client.patch(
            reverse('rede-meu-perfil'),
            {'competencias': ['Fermentação']},
            format='json',
        )

        vinculo = self.membro.vinculos_competencia.get()
        self.assertEqual(vinculo.declarado_por, DeclaradoPor.MEMBRO)

    def test_nome_e_papel_na_rede_sao_cadastro_e_nao_perfil(self):
        self.como(self.pesquisador)

        self.client.patch(
            reverse('rede-meu-perfil'),
            {'nome': 'Outro Nome', 'papel_rede': PapelNaRede.SUPERVISOR},
            format='json',
        )

        self.membro.refresh_from_db()
        self.assertEqual(self.membro.nome, 'Maria Ferreira')
        self.assertEqual(self.membro.papel_rede, PapelNaRede.PESQUISADOR)

    def test_conta_sem_cadastro_na_rede_recebe_404_explicado(self):
        self.como(self.administrador)

        resposta = self.client.get(reverse('rede-meu-perfil'))
        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resposta.data['codigo'], 'sem_membro_rede')


class TitulacaoTests(RedeBaseTests):
    def test_vocabulario_de_titulacao_vem_da_api(self):
        self.como(self.pesquisador)

        resposta = self.client.get(reverse('rede-titulacoes'))
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data[0]['codigo'], 'mestrado')
        self.assertEqual(resposta.data[0]['nivel'], 3)
