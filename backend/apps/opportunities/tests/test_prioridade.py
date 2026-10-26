"""
Testes da prioridade na fila do Supervisor (PB61 / P4).

O que esta sob prova: quem define, os tres valores com Media de partida, a
fila filtrando e ordenando por ela, a trilha com autor e data, e o Demandante
sem ver nada disso - nem no payload, nem no historico, nem pelo filtro.
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.audit.models import EventoAuditoria
from apps.opportunities.models import Oportunidade, PrioridadeOportunidade as P
from core.tests.builders import OportunidadeBuilder, OrganizacaoBuilder, UsuarioBuilder


class PrioridadeBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.empresa = OrganizacaoBuilder().demandante().build()

        self.supervisor = UsuarioBuilder().supervisor().build()
        self.pesquisador = UsuarioBuilder().pesquisador().build()
        self.administrador = UsuarioBuilder().administrador().build()
        self.demandante = UsuarioBuilder().demandante().na_organizacao(self.empresa).build()

        self.oportunidade = OportunidadeBuilder().externa(self.empresa).build()

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def definir(self, prioridade, oportunidade=None):
        alvo = oportunidade or self.oportunidade
        return self.client.post(
            reverse('oportunidade-prioridade', args=[alvo.codigo]),
            {'prioridade': prioridade},
            format='json',
        )

    def fila(self, **parametros):
        resposta = self.client.get(reverse('oportunidade-list'), parametros)
        return resposta.data['results'] if 'results' in resposta.data else resposta.data


class DefinicaoTests(PrioridadeBaseTests):
    def test_toda_oportunidade_nasce_media(self):
        self.assertEqual(self.oportunidade.prioridade, P.MEDIA)

    def test_supervisor_define_a_prioridade(self):
        """SPEC-10: o Supervisor define a prioridade."""
        self.como(self.supervisor)

        resposta = self.definir(P.ALTA)

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['prioridade'], P.ALTA)
        self.assertEqual(resposta.data['prioridade_rotulo'], 'Alta')

    def test_mudanca_entra_na_trilha_com_autor_e_data(self):
        """SPEC-10: a mudanca aparece na trilha com autor e data."""
        self.como(self.supervisor)
        self.definir(P.BAIXA)

        evento = EventoAuditoria.objects.get(tipo='prioridade_definida')
        self.assertEqual(evento.ator, self.supervisor.email)
        self.assertEqual(evento.detalhe, {'de': P.MEDIA, 'para': P.BAIXA})
        self.assertIsNotNone(evento.ocorrido_em)

    def test_repetir_o_valor_nao_suja_a_trilha(self):
        self.como(self.supervisor)
        self.definir(P.MEDIA)

        self.assertFalse(EventoAuditoria.objects.filter(tipo='prioridade_definida').exists())

    def test_prioridade_nao_conta_como_atualizacao_que_o_demandante_ve(self):
        antes = self.oportunidade.atualizada_em
        self.como(self.supervisor)

        self.definir(P.ALTA)

        self.oportunidade.refresh_from_db()
        self.assertEqual(self.oportunidade.atualizada_em, antes)

    def test_valor_fora_da_lista_e_recusado(self):
        self.como(self.supervisor)

        self.assertEqual(self.definir('urgente').status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_o_supervisor_define(self):
        for usuario in (self.pesquisador, self.administrador, self.demandante):
            self.como(usuario)
            self.assertEqual(self.definir(P.ALTA).status_code, status.HTTP_403_FORBIDDEN)

        self.oportunidade.refresh_from_db()
        self.assertEqual(self.oportunidade.prioridade, P.MEDIA)


class FilaTests(PrioridadeBaseTests):
    def setUp(self):
        super().setUp()
        self.alta = OportunidadeBuilder().externa(self.empresa).build()
        self.baixa = OportunidadeBuilder().externa(self.empresa).build()
        Oportunidade.objects.filter(pk=self.alta.pk).update(prioridade=P.ALTA)
        Oportunidade.objects.filter(pk=self.baixa.pk).update(prioridade=P.BAIXA)

    def codigos(self, itens):
        return [item['codigo'] for item in itens]

    def test_fila_ordena_pela_prioridade(self):
        """SPEC-10: a fila ordena pela prioridade."""
        self.como(self.supervisor)

        self.assertEqual(
            self.codigos(self.fila(ordenar='prioridade')),
            [self.alta.codigo, self.oportunidade.codigo, self.baixa.codigo],
        )

    def test_fila_filtra_pela_prioridade(self):
        self.como(self.supervisor)

        self.assertEqual(self.codigos(self.fila(prioridade=P.ALTA)), [self.alta.codigo])

    def test_filtro_malformado_e_recusado(self):
        self.como(self.supervisor)

        resposta = self.client.get(reverse('oportunidade-list'), {'prioridade': 'urgente'})

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)


class DemandanteNaoVeTests(PrioridadeBaseTests):
    def test_payload_do_demandante_nao_traz_a_prioridade(self):
        """SPEC-10: a tela do Demandante nao mostra a prioridade."""
        self.como(self.demandante)

        detalhe = self.client.get(
            reverse('oportunidade-detail', args=[self.oportunidade.codigo])
        ).data

        self.assertNotIn('prioridade', detalhe)
        self.assertNotIn('prioridade_rotulo', detalhe)
        self.assertNotIn('prioridade', self.fila()[0])

    def test_historico_do_demandante_nao_traz_a_mudanca(self):
        self.como(self.supervisor)
        self.definir(P.ALTA)

        self.como(self.demandante)
        historico = self.client.get(
            reverse('oportunidade-historico', args=[self.oportunidade.codigo])
        ).data
        eventos = historico['results'] if 'results' in historico else historico

        self.assertNotIn('prioridade_definida', [evento['tipo'] for evento in eventos])

    def test_filtro_por_prioridade_nao_revela_nada_ao_demandante(self):
        outra = OportunidadeBuilder().externa(self.empresa).build()
        Oportunidade.objects.filter(pk=outra.pk).update(prioridade=P.ALTA)
        self.como(self.demandante)

        self.assertEqual(len(self.fila(prioridade=P.ALTA)), 2)
