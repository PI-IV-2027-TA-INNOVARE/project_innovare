"""
Testes da Proposta Estruturada (RF04 / PB40, PB41, PB63).

A proposta e o artefato que o Supervisor consolida; ela nao nasce com a
oportunidade. P22 autoriza a edicao manual antes do Copiloto: os oito elementos
nascem vazios e o Supervisor os preenche.

Nenhum toca banco remoto, SMTP real ou provedor de IA (AGENTS.md 0.1).
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Papel, Usuario
from apps.audit.models import CategoriaEvento, EventoAuditoria
from apps.copilot.models import PropostaEstruturada
from apps.matching.models import EquipePotencial, MembroEquipe
from apps.network.models import MembroRede, PapelNaRede, SituacaoMembro
from apps.opportunities.models import Oportunidade
from apps.organizations.models import Organizacao, TipoOrganizacao

SENHA = 'Bioinsumo!2026'

PREENCHIDA = {
    'problema_pesquisa': 'Contaminacao por Alicyclobacillus resiste a pasteurizacao.',
    'objetivo_geral': 'Desenvolver protocolo de deteccao rapida.',
    'objetivos_especificos': ['Isolar cepas', 'Validar o metodo'],
    'metodologia': 'Cultivo seletivo seguido de PCR em tempo real.',
    'resultados_esperados': 'Protocolo validado em 48 horas.',
    'caracterizacao_inovacao': 'Reduz de 10 dias para 48 horas.',
    'infraestrutura_recursos': 'Laboratorio de microbiologia da AC2.',
}


class PropostaBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.vale_verde = Organizacao.objects.create(
            tipo=TipoOrganizacao.DEMANDANTE,
            nome='Agroindustria Vale Verde',
            cnpj='12345678000199',
        )

        self.supervisor = Usuario.objects.create_user(
            email='supervisor@ac2microbiologia.com.br',
            nome='Rafael Antunes', papel=Papel.SUPERVISOR, password=SENHA,
        )
        self.pesquisador = Usuario.objects.create_user(
            email='pesquisador@ac2microbiologia.com.br',
            nome='Maria Ferreira', papel=Papel.PESQUISADOR, password=SENHA,
        )
        self.demandante = Usuario.objects.create_user(
            email='demandante@valeverde.com.br',
            nome='Agroindustria Vale Verde', papel=Papel.DEMANDANTE,
            organizacao=self.vale_verde, password=SENHA,
        )

        self.membro_pesquisador = MembroRede.objects.create(
            usuario=self.pesquisador, nome='Maria Ferreira',
            email=self.pesquisador.email, papel_rede=PapelNaRede.PESQUISADOR,
            situacao=SituacaoMembro.ATIVO,
        )

        self.como(self.demandante)
        self.codigo = self.client.post(
            reverse('oportunidade-list'),
            {'titulo': 'Contaminacao na linha de envase',
             'resumo': 'Perdas por contaminacao microbiana.'},
            format='json',
        ).data['codigo']

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def url(self):
        return reverse('oportunidade-proposta', args=[self.codigo])

    def iniciar(self):
        return self.client.post(self.url())

    def na_equipe(self):
        """O Pesquisador alcanca a oportunidade por indicacao `incluido`."""
        MembroEquipe.objects.create(
            equipe=EquipePotencial.objects.create(
                oportunidade=Oportunidade.objects.get(codigo=self.codigo)
            ),
            membro=self.membro_pesquisador,
            papel=PapelNaRede.PESQUISADOR,
        )


class InicioDaPropostaTests(PropostaBaseTests):
    def test_oportunidade_nasce_sem_proposta(self):
        """
        PB40 fala em *consolidar*: a proposta e ato do Supervisor, nao atributo
        automatico de todo problema que entra.
        """
        self.como(self.supervisor)

        resposta = self.client.get(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resposta.data['codigo'], 'proposta_inexistente')

    def test_supervisor_inicia_a_proposta_com_os_oito_elementos_vazios(self):
        self.como(self.supervisor)

        resposta = self.iniciar()

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resposta.data['problema_pesquisa'], '')
        self.assertEqual(resposta.data['objetivos_especificos'], [])
        self.assertEqual(resposta.data['versao'], 1)
        self.assertFalse(resposta.data['revisada_por_humano'])

    def test_proposta_iniciada_passa_a_ser_legivel(self):
        self.como(self.supervisor)
        self.iniciar()

        self.assertEqual(self.client.get(self.url()).status_code, status.HTTP_200_OK)

    def test_iniciar_duas_vezes_e_conflito(self):
        self.como(self.supervisor)
        self.iniciar()

        resposta = self.iniciar()

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(PropostaEstruturada.objects.count(), 1)

    def test_inicio_deixa_evento_na_trilha(self):
        self.como(self.supervisor)
        self.iniciar()

        evento = EventoAuditoria.objects.get(tipo='proposta_iniciada')
        self.assertEqual(evento.categoria, CategoriaEvento.COPILOTO)
        self.assertEqual(evento.ator, self.supervisor.email)


class EdicaoDaPropostaTests(PropostaBaseTests):
    def setUp(self):
        super().setUp()
        self.como(self.supervisor)
        self.iniciar()

    def test_supervisor_edita_os_elementos(self):
        """
        Pega tambem o sombreamento de rota: GET e PATCH moram no mesmo caminho,
        e uma rota por metodo faz a primeira registrada responder 405 as
        outras.
        """
        resposta = self.client.patch(self.url(), PREENCHIDA, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(
            resposta.data['problema_pesquisa'], PREENCHIDA['problema_pesquisa']
        )
        self.assertEqual(resposta.data['objetivos_especificos'],
                         ['Isolar cepas', 'Validar o metodo'])

    def test_edicao_registra_a_revisao_humana_e_quem_revisou(self):
        """AGENTS.md 0.2: a saida de IA so vira decisao depois de revisada."""
        resposta = self.client.patch(self.url(), PREENCHIDA, format='json')

        self.assertTrue(resposta.data['revisada_por_humano'])
        self.assertEqual(resposta.data['revisor_nome'], self.supervisor.nome)

    def test_edicao_parcial_nao_apaga_o_que_nao_veio(self):
        self.client.patch(self.url(), PREENCHIDA, format='json')

        resposta = self.client.patch(
            self.url(), {'metodologia': 'Cultivo seletivo e sequenciamento.'},
            format='json',
        )

        self.assertEqual(resposta.data['metodologia'],
                         'Cultivo seletivo e sequenciamento.')
        self.assertEqual(
            resposta.data['problema_pesquisa'], PREENCHIDA['problema_pesquisa']
        )

    def test_edicao_deixa_evento_com_os_campos_mexidos(self):
        self.client.patch(
            self.url(), {'metodologia': 'Cultivo seletivo.'}, format='json'
        )

        evento = EventoAuditoria.objects.get(tipo='proposta_atualizada')
        self.assertEqual(evento.categoria, CategoriaEvento.COPILOTO)
        self.assertEqual(evento.detalhe['campos'], ['metodologia'])

    def test_editar_proposta_nao_iniciada_responde_404_explicado(self):
        PropostaEstruturada.objects.all().delete()

        resposta = self.client.patch(self.url(), PREENCHIDA, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resposta.data['codigo'], 'proposta_inexistente')


class EscopoDaPropostaTests(PropostaBaseTests):
    def test_so_o_supervisor_inicia(self):
        for usuario in (self.pesquisador, self.demandante):
            with self.subTest(papel=usuario.papel):
                self.como(usuario)
                self.assertEqual(
                    self.iniciar().status_code, status.HTTP_403_FORBIDDEN
                )

    def test_so_o_supervisor_edita(self):
        self.como(self.supervisor)
        self.iniciar()
        self.na_equipe()

        for usuario in (self.pesquisador, self.demandante):
            with self.subTest(papel=usuario.papel):
                self.como(usuario)
                self.assertEqual(
                    self.client.patch(self.url(), PREENCHIDA, format='json').status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_pesquisador_da_equipe_le_a_proposta(self):
        """D02: ele acompanha a oportunidade que a equipe potencial o indicou."""
        self.como(self.supervisor)
        self.iniciar()
        self.na_equipe()

        self.como(self.pesquisador)
        self.assertEqual(self.client.get(self.url()).status_code, status.HTTP_200_OK)

    def test_demandante_nao_le_a_proposta(self):
        """
        PB71: ele acompanha o andamento "sem acessar informacoes internas
        restritas". A proposta e trabalho interno - a mesma razao que mantem
        `copiloto` fora de CATEGORIAS_VISIVEIS_AO_DEMANDANTE.
        """
        self.como(self.supervisor)
        self.iniciar()

        self.como(self.demandante)
        self.assertEqual(
            self.client.get(self.url()).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_trilha_da_proposta_nao_chega_ao_demandante(self):
        self.como(self.supervisor)
        self.iniciar()

        self.como(self.demandante)
        historico = self.client.get(
            reverse('oportunidade-historico', args=[self.codigo])
        ).data

        self.assertNotIn(
            'proposta_iniciada', [evento['tipo'] for evento in historico]
        )
