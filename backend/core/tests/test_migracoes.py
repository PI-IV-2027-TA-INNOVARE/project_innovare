"""
A guarda das migrations que so convertem a tabela vazia.

O que se testa aqui e a guarda, nao a migration: rodar as migrations de novo
dentro da suite exigiria um segundo banco, e o `MigrationExecutor` sobre o
banco de teste desfaz o schema que os outros testes usam.

Nada toca banco remoto (AGENTS.md 0.1): a guarda le pelo ORM, no banco de
teste que o proprio Django cria e destroi.
"""
from django.apps import apps as registro_de_apps
from django.test import TestCase

from apps.copilot.models import Lacuna, TipoLacuna
from apps.matching.models import EquipePotencial
from apps.opportunities.models import Oportunidade, OrigemOportunidade
from core.migracoes import MigrationExigeTabelaVazia, exigir_tabela_vazia


def rodar(guarda):
    guarda(registro_de_apps, None)


class GuardaDeTabelaVaziaTests(TestCase):
    def setUp(self):
        self.oportunidade = Oportunidade.objects.create(
            codigo='OP-2026-001',
            titulo='Contaminacao em lote',
            origem=OrigemOportunidade.INTERNA,
            resumo='Resumo.',
            contexto='Contexto.',
        )

    def test_tabela_vazia_deixa_passar(self):
        guarda = exigir_tabela_vazia('matching', 'EquipePotencial', 'converte')

        self.assertIsNone(rodar(guarda))

    def test_tabela_com_linha_interrompe_antes_de_qualquer_escrita(self):
        EquipePotencial.objects.create(oportunidade=self.oportunidade)
        guarda = exigir_tabela_vazia('matching', 'EquipePotencial', 'converte')

        with self.assertRaises(MigrationExigeTabelaVazia):
            rodar(guarda)

    def test_o_erro_ensina_a_sair_dele(self):
        """
        Quem toma a falha num deploy precisa sair dela sabendo o que fazer.
        """
        EquipePotencial.objects.create(oportunidade=self.oportunidade)
        guarda = exigir_tabela_vazia(
            'matching', 'EquipePotencial', 'converte indicacao em cabecalho'
        )

        with self.assertRaises(MigrationExigeTabelaVazia) as erro:
            rodar(guarda)

        mensagem = str(erro.exception)

        self.assertIn('matching.EquipePotencial', mensagem)
        self.assertIn('1 registro(s)', mensagem)
        self.assertIn('converte indicacao em cabecalho', mensagem)
        self.assertIn('Nada foi alterado', mensagem)
        self.assertIn('migration de dados', mensagem)

    def test_filtro_olha_so_o_recorte_que_atrapalha(self):
        Lacuna.objects.create(
            oportunidade=self.oportunidade,
            tipo=TipoLacuna.PROPOSTA,
            descricao='Falta a metodologia.',
        )
        guarda = exigir_tabela_vazia(
            'copilot', 'Lacuna', 'converte', filtro={'tipo': 'competencia'}
        )

        self.assertIsNone(rodar(guarda))

    def test_filtro_barra_quando_o_recorte_tem_linha(self):
        Lacuna.objects.create(
            oportunidade=self.oportunidade,
            tipo='competencia',
            descricao='Nenhum membro cobre microbiologia de alimentos.',
        )
        guarda = exigir_tabela_vazia(
            'copilot', 'Lacuna', 'converte', filtro={'tipo': 'competencia'}
        )

        with self.assertRaises(MigrationExigeTabelaVazia) as erro:
            rodar(guarda)

        self.assertIn("{'tipo': 'competencia'}", str(erro.exception))
