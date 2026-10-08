"""
Consulta da trilha de auditoria pelo console do Administrador (RF12).

A trilha ja existia como aba da oportunidade, recortada por um codigo. O que
falta e a visao transversal: ver o que aconteceu na plataforma sem partir de um
registro. E leitura pura - a tabela e append-only e nao ha rota de escrita.

Nada aqui toca banco remoto, SMTP real ou provedor de IA (AGENTS.md 0.1).
"""
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.audit.models import CategoriaEvento, StatusEvento
from apps.audit.services import registrar_evento
from core.tests.builders import UsuarioBuilder


class TrilhaBaseTests(TestCase):
    url = reverse('trilha-list')

    def setUp(self):
        self.client = APIClient()

        self.administrador = (
            UsuarioBuilder().administrador().chamado('Console').build()
        )
        self.supervisor = UsuarioBuilder().supervisor().chamado('Rafael').build()
        self.pesquisador = UsuarioBuilder().pesquisador().chamado('Maria').build()

        self.agora = timezone.now()

        registrar_evento(
            categoria=CategoriaEvento.OPORTUNIDADE,
            tipo='oportunidade_cadastrada',
            entidade='oportunidade',
            entidade_id='OP-2026-001',
            ator=self.supervisor.email,
            ocorrido_em=self.agora - timedelta(days=10),
        )
        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='conta_provisionada',
            entidade='usuario',
            entidade_id=str(self.pesquisador.id_usuario),
            ator=self.administrador.email,
            ocorrido_em=self.agora - timedelta(days=1),
        )
        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='login_recusado',
            entidade='usuario',
            entidade_id=str(self.pesquisador.id_usuario),
            ator=self.pesquisador.email,
            status=StatusEvento.NEGADO,
            motivo='Senha invalida.',
            ocorrido_em=self.agora - timedelta(hours=2),
        )

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def listar(self, **filtros):
        return self.client.get(self.url, filtros)


class AcessoATrilhaTests(TrilhaBaseTests):
    def test_administrador_le_a_trilha_inteira(self):
        self.como(self.administrador)
        resposta = self.listar()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['count'], 3)

    def test_supervisor_nao_alcanca_o_console(self):
        """
        A trilha transversal é do Administrador.

        O Supervisor acompanha a trilha *da oportunidade*, que tem rota
        própria e recorte por código.
        """
        self.como(self.supervisor)

        self.assertEqual(self.listar().status_code, status.HTTP_403_FORBIDDEN)

    def test_pesquisador_nao_alcanca_o_console(self):
        self.como(self.pesquisador)

        self.assertEqual(self.listar().status_code, status.HTTP_403_FORBIDDEN)

    def test_anonimo_nao_alcanca_o_console(self):
        self.assertEqual(self.listar().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_trilha_nao_aceita_escrita(self):
        """Append-only: o console lê, e não existe rota que grave ou apague."""
        self.como(self.administrador)

        self.assertEqual(
            self.client.post(self.url, {}, format='json').status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class FiltrosDaTrilhaTests(TrilhaBaseTests):
    def setUp(self):
        super().setUp()
        self.como(self.administrador)

    def test_ordena_do_mais_recente_para_o_mais_antigo(self):
        tipos = [e['tipo'] for e in self.listar().data['results']]

        self.assertEqual(
            tipos,
            ['login_recusado', 'conta_provisionada', 'oportunidade_cadastrada'],
        )

    def test_filtra_por_categoria(self):
        resposta = self.listar(categoria=CategoriaEvento.CONTA)

        self.assertEqual(resposta.data['count'], 2)
        self.assertEqual(
            {e['categoria'] for e in resposta.data['results']}, {'conta'}
        )

    def test_filtra_por_status(self):
        resposta = self.listar(status=StatusEvento.NEGADO)

        self.assertEqual(resposta.data['count'], 1)
        self.assertEqual(resposta.data['results'][0]['motivo'], 'Senha invalida.')

    def test_busca_por_ator_entidade_ou_tipo(self):
        por_ator = self.listar(busca=self.supervisor.email[:10])
        por_entidade = self.listar(busca='OP-2026-001')
        por_tipo = self.listar(busca='login')

        self.assertEqual(por_ator.data['count'], 1)
        self.assertEqual(por_entidade.data['count'], 1)
        self.assertEqual(por_tipo.data['count'], 1)

    def test_filtra_por_periodo(self):
        ontem = (self.agora - timedelta(days=2)).date().isoformat()

        self.assertEqual(self.listar(desde=ontem).data['count'], 2)
        self.assertEqual(self.listar(ate=ontem).data['count'], 1)

    def test_periodo_invalido_devolve_400_e_nao_ignora_o_filtro(self):
        """
        Filtro que o servidor não entende não pode virar "sem filtro".

        Devolver a lista inteira faria o Administrador ler o resultado errado
        acreditando ter filtrado.
        """
        resposta = self.listar(desde='ontem')

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_categoria_desconhecida_devolve_400(self):
        self.assertEqual(
            self.listar(categoria='inventada').status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_catalogo_de_filtros_acompanha_o_modelo(self):
        """A tela monta os selects a partir daqui, e não de uma lista copiada."""
        resposta = self.client.get(reverse('trilha-filtros'))

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [c['valor'] for c in resposta.data['categorias']],
            [valor for valor, _ in CategoriaEvento.choices],
        )
        self.assertEqual(
            [s['valor'] for s in resposta.data['status']],
            [valor for valor, _ in StatusEvento.choices],
        )


class ConteudoDoEventoTests(TrilhaBaseTests):
    def test_evento_traz_o_que_a_tela_mostra(self):
        self.como(self.administrador)
        evento = self.listar(busca='OP-2026-001').data['results'][0]

        self.assertEqual(
            set(evento),
            {
                'id_evento', 'ocorrido_em', 'categoria', 'categoria_rotulo',
                'tipo', 'ator', 'entidade', 'entidade_id', 'status',
                'status_rotulo', 'motivo', 'detalhe', 'correlation_id',
            },
        )

    def test_evento_do_sistema_aparece_com_ator_legivel(self):
        registrar_evento(
            categoria=CategoriaEvento.CONFIG,
            tipo='tema_alterado',
            entidade='configuracao',
            entidade_id='tema',
        )

        self.como(self.administrador)
        atores = [e['ator'] for e in self.listar(categoria='config').data['results']]

        self.assertEqual(atores, ['__sistema__'])
