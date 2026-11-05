"""
A rede interna em paginas, com ordem e resumo calculados na API.

A tela pedia 100 pessoas de uma vez e filtrava, ordenava e contava no
navegador. Da 101a pessoa em diante, quem estava na rede sumia da lista, da
busca e dos numeros do topo sem aviso. Agora a lista vem em paginas, a ordem
sai do banco e os numeros do topo saem de `/rede/resumo/`, sobre a rede
inteira.
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from core.tests.builders import MembroRedeBuilder, OrganizacaoBuilder, UsuarioBuilder


class RedeEmPaginasTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.client.force_authenticate(user=self.supervisor)

    def listar(self, **params):
        return self.client.get(reverse('membro-rede-list'), params)

    def test_a_lista_vem_em_paginas_com_o_total(self):
        for indice in range(25):
            MembroRedeBuilder().chamado(f'Pessoa {indice:02d}').build()

        resposta = self.listar(page_size=20)

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['count'], 25)
        self.assertEqual(len(resposta.data['results']), 20)
        self.assertIsNotNone(resposta.data['next'])

    def test_ordena_pelo_nome_nos_dois_sentidos(self):
        for nome in ('Bruno Dias', 'Ana Souza', 'Clara Nunes'):
            MembroRedeBuilder().chamado(nome).build()

        crescente = [item['nome'] for item in self.listar(ordenar='nome').data['results']]
        decrescente = [item['nome'] for item in self.listar(ordenar='-nome').data['results']]

        self.assertEqual(crescente, ['Ana Souza', 'Bruno Dias', 'Clara Nunes'])
        self.assertEqual(decrescente, ['Clara Nunes', 'Bruno Dias', 'Ana Souza'])

    def test_ordena_pela_titulacao_do_nivel_menor_ao_maior(self):
        MembroRedeBuilder().chamado('Doutora').com_titulacao('doutorado').build()
        MembroRedeBuilder().chamado('Graduado').com_titulacao('graduacao').build()
        MembroRedeBuilder().chamado('Mestre').com_titulacao('mestrado').build()

        nomes = [item['nome'] for item in self.listar(ordenar='titulacao').data['results']]

        self.assertEqual(nomes, ['Graduado', 'Mestre', 'Doutora'])

    def test_ordem_desconhecida_e_recusada_com_motivo(self):
        resposta = self.listar(ordenar='senha')

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('ordenar', resposta.data)


class ResumoDaRedeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.supervisor = UsuarioBuilder().supervisor().build()

    def resumo(self, usuario=None):
        self.client.force_authenticate(user=usuario or self.supervisor)
        return self.client.get(reverse('membro-rede-resumo'))

    def test_conta_a_rede_inteira_e_nao_so_a_primeira_pagina(self):
        for indice in range(23):
            MembroRedeBuilder().chamado(f'Sem acesso {indice}').com_competencia('Microbiologia').build()

        MembroRedeBuilder().chamado('Com acesso').com_acesso().com_titulacao('doutorado').build()
        MembroRedeBuilder().chamado('Mestra').com_titulacao('mestrado').com_tecnica('PCR').build()

        resposta = self.resumo()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(
            resposta.data,
            {'total': 25, 'ativos': 1, 'titulados': 2, 'sem_competencia': 2},
        )

    def test_demandante_nao_ve_o_resumo(self):
        demandante = (
            UsuarioBuilder()
            .demandante()
            .na_organizacao(OrganizacaoBuilder().demandante().build())
            .build()
        )

        self.assertEqual(self.resumo(demandante).status_code, status.HTTP_403_FORBIDDEN)
