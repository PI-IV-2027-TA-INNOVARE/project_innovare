"""
Cadastro do Demandante Externo pelo Administrador, ja ligado a empresa.

Na baseline o Demandante e a empresa: o nome da conta e o nome da empresa, e o
CNPJ fica em `Organizacao`. Sem esse vinculo o Demandante entrava e nao
conseguia cadastrar problema nenhum.
"""
from django.core import mail
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import (
    DemandanteExterno,
    FinalidadeToken,
    Papel,
    TokenAcesso,
    Usuario,
)
from apps.audit.models import EventoAuditoria
from apps.organizations.models import Organizacao, TipoOrganizacao
from core.tests.builders import OrganizacaoBuilder, UsuarioBuilder

SENHA = 'Bioinsumo!2026'
CNPJ_VALE_VERDE = '11.222.333/0001-81'
CNPJ_TERRA_BOA = '11.444.777/0001-61'


class BaseDemandante(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = UsuarioBuilder().administrador().com_senha(SENHA).build()
        self.client.force_authenticate(self.admin)

    def criar_demandante(self, **extra):
        corpo = {
            'email': 'contato@valeverde.com.br',
            'papel': Papel.DEMANDANTE,
            'cnpj': CNPJ_VALE_VERDE,
            'nome_empresa': 'Agroindústria Vale Verde',
        }
        corpo.update(extra)
        return self.client.post(reverse('usuario-list'), corpo, format='json')


class CadastroDoDemandanteTests(BaseDemandante):
    def test_cria_a_empresa_e_liga_a_conta_a_ela(self):
        resposta = self.criar_demandante()

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        usuario = Usuario.objects.get(email='contato@valeverde.com.br')
        self.assertEqual(usuario.organizacao.cnpj, '11222333000181')
        self.assertEqual(usuario.organizacao.tipo, TipoOrganizacao.DEMANDANTE)
        self.assertEqual(usuario.organizacao.nome, 'Agroindústria Vale Verde')

    def test_o_nome_da_conta_e_o_nome_da_empresa(self):
        self.criar_demandante()

        usuario = Usuario.objects.get(email='contato@valeverde.com.br')
        self.assertEqual(usuario.nome, 'Agroindústria Vale Verde')

    def test_nasce_com_o_perfil_de_demandante(self):
        self.criar_demandante()

        usuario = Usuario.objects.get(email='contato@valeverde.com.br')
        self.assertTrue(DemandanteExterno.objects.filter(usuario=usuario).exists())

    def test_segundo_contato_da_mesma_empresa_reaproveita_a_organizacao(self):
        self.criar_demandante()
        resposta = self.criar_demandante(
            email='pesquisa@valeverde.com.br', nome_empresa='Outro nome qualquer'
        )

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Organizacao.objects.filter(cnpj='11222333000181').count(), 1)
        segundo = Usuario.objects.get(email='pesquisa@valeverde.com.br')
        self.assertEqual(segundo.organizacao.nome, 'Agroindústria Vale Verde')
        self.assertEqual(segundo.nome, 'Agroindústria Vale Verde')

    def test_cnpj_com_digito_errado_e_recusado_no_campo(self):
        resposta = self.criar_demandante(cnpj='11.222.333/0001-80')

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cnpj', resposta.data)
        self.assertIn('CNPJ inválido', str(resposta.data['cnpj']))
        self.assertFalse(Usuario.objects.filter(email='contato@valeverde.com.br').exists())

    def test_demandante_sem_cnpj_e_recusado(self):
        resposta = self.criar_demandante(cnpj='')

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cnpj', resposta.data)

    def test_demandante_sem_nome_da_empresa_nova_e_recusado(self):
        resposta = self.criar_demandante(nome_empresa='')

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('nome_empresa', resposta.data)

    def test_cnpj_e_empresa_so_valem_para_o_demandante(self):
        resposta = self.client.post(
            reverse('usuario-list'),
            {
                'nome': 'Ana Prado',
                'email': 'ana.prado@ac2.example',
                'papel': Papel.SUPERVISOR,
                'cnpj': CNPJ_VALE_VERDE,
                'nome_empresa': 'Agroindústria Vale Verde',
            },
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cnpj', resposta.data)

    def test_supervisor_continua_sendo_criado_so_com_nome_e_email(self):
        resposta = self.client.post(
            reverse('usuario-list'),
            {
                'nome': 'Ana Prado',
                'email': 'ana.prado@ac2.example',
                'papel': Papel.SUPERVISOR,
            },
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(Usuario.objects.get(email='ana.prado@ac2.example').organizacao)

    def test_supervisor_sem_nome_e_recusado(self):
        resposta = self.client.post(
            reverse('usuario-list'),
            {'email': 'ana.prado@ac2.example', 'papel': Papel.SUPERVISOR},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('nome', resposta.data)

    def test_cnpj_de_instituicao_nao_vira_empresa_demandante(self):
        OrganizacaoBuilder().instituicao().chamada('Universidade X').com_cnpj(
            '11222333000181'
        ).build()

        resposta = self.criar_demandante()

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)

    def test_trilha_registra_a_empresa(self):
        self.criar_demandante()

        usuario = Usuario.objects.get(email='contato@valeverde.com.br')
        evento = EventoAuditoria.objects.get(
            tipo='conta_criada', entidade_id=str(usuario.id_usuario)
        )
        self.assertEqual(evento.detalhe['organizacao'], usuario.organizacao_id)

    def test_resposta_traz_o_cnpj_formatado(self):
        resposta = self.criar_demandante()

        self.assertEqual(resposta.data['cnpj'], CNPJ_VALE_VERDE)
        self.assertEqual(resposta.data['instituicao'], 'Agroindústria Vale Verde')


class PrimeiroAcessoDoDemandanteTests(BaseDemandante):
    def test_demandante_criado_pelo_administrador_cadastra_problema_no_primeiro_acesso(self):
        self.criar_demandante()

        token = TokenAcesso.objects.get(
            usuario__email='contato@valeverde.com.br',
            finalidade=FinalidadeToken.CONVITE,
        )
        self.assertEqual(len(mail.outbox), 1)

        anonimo = APIClient()
        definida = anonimo.post(
            reverse('auth-reset-password'),
            {'token': token.token, 'nova_senha': SENHA, 'confirmar_senha': SENHA},
            format='json',
        )
        self.assertEqual(definida.status_code, status.HTTP_200_OK)

        login = anonimo.post(
            reverse('auth-token'),
            {'email': 'contato@valeverde.com.br', 'password': SENHA},
            format='json',
        )
        anonimo.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')

        problema = anonimo.post(
            reverse('oportunidade-list'),
            {'titulo': 'Contaminação na linha de envase', 'resumo': 'Perdas.'},
            format='json',
        )

        self.assertEqual(problema.status_code, status.HTTP_201_CREATED)
        self.assertEqual(problema.data['origem'], 'externo')


class ConsultaDeEmpresaTests(BaseDemandante):
    def test_administrador_encontra_a_empresa_pelo_cnpj(self):
        OrganizacaoBuilder().demandante().chamada('Agroindústria Vale Verde').com_cnpj(
            '11222333000181'
        ).build()

        resposta = self.client.get(
            reverse('usuario-empresa'), {'cnpj': CNPJ_VALE_VERDE}
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['nome'], 'Agroindústria Vale Verde')
        self.assertEqual(resposta.data['cnpj'], CNPJ_VALE_VERDE)

    def test_cnpj_sem_empresa_responde_404(self):
        resposta = self.client.get(
            reverse('usuario-empresa'), {'cnpj': CNPJ_TERRA_BOA}
        )

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)

    def test_cnpj_invalido_na_consulta_responde_400(self):
        resposta = self.client.get(reverse('usuario-empresa'), {'cnpj': '123'})

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_supervisor_nao_consulta_empresa(self):
        self.client.force_authenticate(UsuarioBuilder().supervisor().build())

        resposta = self.client.get(
            reverse('usuario-empresa'), {'cnpj': CNPJ_VALE_VERDE}
        )

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)


class EdicaoDoDemandanteTests(BaseDemandante):
    def test_edicao_troca_a_empresa(self):
        self.criar_demandante()
        usuario = Usuario.objects.get(email='contato@valeverde.com.br')

        resposta = self.client.patch(
            reverse('usuario-detail', args=[usuario.id_usuario]),
            {'cnpj': CNPJ_TERRA_BOA, 'nome_empresa': 'Cooperativa Terra Boa'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        usuario.refresh_from_db()
        self.assertEqual(usuario.organizacao.cnpj, '11444777000161')
        self.assertEqual(usuario.nome, 'Cooperativa Terra Boa')

    def test_demandante_antigo_sem_empresa_e_completado_pela_edicao(self):
        antigo = UsuarioBuilder().demandante().chamado('Contato antigo').build()

        resposta = self.client.patch(
            reverse('usuario-detail', args=[antigo.id_usuario]),
            {'cnpj': CNPJ_VALE_VERDE, 'nome_empresa': 'Agroindústria Vale Verde'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        antigo.refresh_from_db()
        self.assertEqual(antigo.organizacao.cnpj, '11222333000181')

    def test_lista_mostra_quem_esta_sem_empresa(self):
        UsuarioBuilder().demandante().chamado('Contato antigo').build()

        resposta = self.client.get(reverse('usuario-list'), {'papel': Papel.DEMANDANTE})

        registro = resposta.data['results'][0]
        self.assertIsNone(registro['cnpj'])
        self.assertIsNone(registro['instituicao'])


class TelefoneDoDemandanteTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.empresa = OrganizacaoBuilder().demandante().chamada('Vale Verde').build()
        self.demandante = (
            UsuarioBuilder().demandante().na_organizacao(self.empresa).com_senha(SENHA).build()
        )
        self.client.force_authenticate(self.demandante)

    def test_demandante_salva_o_telefone_no_proprio_perfil(self):
        resposta = self.client.patch(
            reverse('auth-profile'), {'telefone': '(19) 99876-5432'}, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['telefone'], '(19) 99876-5432')
        self.assertEqual(
            DemandanteExterno.objects.get(usuario=self.demandante).telefone,
            '19998765432',
        )

    def test_demandante_corrige_e_apaga_o_telefone(self):
        self.client.patch(reverse('auth-profile'), {'telefone': '1933334444'}, format='json')
        resposta = self.client.patch(reverse('auth-profile'), {'telefone': ''}, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['telefone'], '')

    def test_telefone_incompleto_e_recusado(self):
        resposta = self.client.patch(
            reverse('auth-profile'), {'telefone': '9988'}, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('telefone', resposta.data)

    def test_perfil_do_demandante_traz_o_telefone(self):
        self.client.patch(reverse('auth-profile'), {'telefone': '1933334444'}, format='json')

        resposta = self.client.get(reverse('auth-profile'))

        self.assertEqual(resposta.data['telefone'], '(19) 3333-4444')

    def test_outros_papeis_nao_tem_telefone_de_contato(self):
        self.client.force_authenticate(UsuarioBuilder().supervisor().build())

        resposta = self.client.patch(
            reverse('auth-profile'), {'telefone': '1933334444'}, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_administrador_ve_o_telefone_na_lista(self):
        self.client.patch(reverse('auth-profile'), {'telefone': '1933334444'}, format='json')
        self.client.force_authenticate(UsuarioBuilder().administrador().build())

        resposta = self.client.get(reverse('usuario-list'), {'papel': Papel.DEMANDANTE})

        self.assertEqual(resposta.data['results'][0]['telefone'], '(19) 3333-4444')

    def test_trilha_registra_a_troca_sem_o_numero(self):
        self.client.patch(reverse('auth-profile'), {'telefone': '1933334444'}, format='json')

        evento = EventoAuditoria.objects.get(tipo='telefone_atualizado')
        self.assertNotIn('1933334444', str(evento.detalhe))
