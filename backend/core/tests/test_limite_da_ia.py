"""
As rotas que chamam a IA tem limite proprio de pedidos por pessoa.

Antes valia o limite geral, 240 pedidos por minuto: uma conta invadida gastava
o teto do mes em minutos. O teto de gasto por oportunidade continua valendo;
este limite e o freio de antes dele.

A suite desliga todos os limites de pedidos; aqui o da IA e ligado de proposito.
"""
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from core.tests.builders import OportunidadeBuilder, UsuarioBuilder


@override_settings(LIMITE_DA_IA='2/hour')
class LimiteDaIATests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.oportunidade = OportunidadeBuilder().interna().criada_por(self.supervisor).build()
        self.client.force_authenticate(self.supervisor)

    def tearDown(self):
        cache.clear()

    def url(self, nome):
        return reverse(f'oportunidade-{nome}', args=[self.oportunidade.codigo])

    def derivar(self):
        return self.client.post(self.url('competencias-derivar'))

    def test_passado_o_limite_a_rota_de_ia_responde_429_explicado(self):
        self.derivar()
        self.derivar()

        resposta = self.derivar()

        self.assertEqual(resposta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(resposta.data['codigo'], 'limite_de_pedidos')
        self.assertIn('Tente de novo em', resposta.data['detail'])
        self.assertIn('Retry-After', resposta)

    def test_as_rotas_de_ia_somam_no_mesmo_limite(self):
        self.derivar()
        self.client.post(self.url('copiloto-estruturar'))

        resposta = self.client.post(self.url('pre-analise'))

        self.assertEqual(resposta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_leitura_nao_conta_no_limite(self):
        self.derivar()
        self.derivar()

        self.assertEqual(self.client.get(self.url('copiloto')).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(self.url('detail')).status_code, status.HTTP_200_OK)

    def test_o_limite_e_de_cada_pessoa(self):
        self.derivar()
        self.derivar()

        outro = UsuarioBuilder().supervisor().build()
        self.client.force_authenticate(outro)

        self.assertNotEqual(self.derivar().status_code, status.HTTP_429_TOO_MANY_REQUESTS)
