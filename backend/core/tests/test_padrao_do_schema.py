"""
Convencao de nomes do banco: o schema do projeto fala portugues.

Vale para as tabelas dos apps do projeto. As do framework - `auth_*`,
`django_*`, `token_blacklist_*` e as N:N que o `PermissionsMixin` cria em
`usuario` - seguem com os nomes do Django e do SimpleJWT: renomea-las quebra
as migrations e o codigo deles, que nao sao nossos.

Ficam de fora tambem os termos tecnicos sem traducao consagrada (`token`,
`prompt`, `mime`) e o que o dicionario ja acolheu (`status`).
"""
import re

from django.apps import apps
from django.db import models
from django.test import SimpleTestCase

MODULOS_DE_TERCEIROS = ('django.', 'rest_framework_simplejwt')

PALAVRAS_EM_INGLES = {
    'login', 'is', 'superuser', 'staff', 'correlation', 'match', 'reasons',
    'score', 'features', 'payload', 'fallback', 'rerank', 'created', 'updated',
    'user', 'name', 'date', 'at', 'by',
}


def modelos_do_projeto():
    return [
        modelo
        for modelo in apps.get_models()
        if not modelo.__module__.startswith(MODULOS_DE_TERCEIROS)
    ]


def colunas(modelo):
    return [campo for campo in modelo._meta.local_fields]


class PadraoDoSchemaTests(SimpleTestCase):
    def test_toda_chave_primaria_comeca_com_id(self):
        fora = [
            f'{m._meta.db_table}.{m._meta.pk.column}'
            for m in modelos_do_projeto()
            if not m._meta.pk.column.startswith('id_')
        ]

        self.assertEqual(fora, [])

    def test_toda_chave_estrangeira_comeca_com_id(self):
        """
        `oportunidade.id_criado_por` e `membro_rede.cadastrado_por` apontavam
        para a mesma tabela com convencoes diferentes: quem le o banco sem o
        codigo nao distingue a referencia do texto.
        """
        fora = [
            f'{m._meta.db_table}.{campo.column}'
            for m in modelos_do_projeto()
            for campo in colunas(m)
            if campo.is_relation and campo.many_to_one
            and not campo.column.startswith('id_')
        ]

        self.assertEqual(fora, [])

    def test_identificador_vem_na_frente_do_nome(self):
        """`id_entidade`, como `id_oportunidade` - e nao `entidade_id`."""
        fora = [
            f'{m._meta.db_table}.{campo.column}'
            for m in modelos_do_projeto()
            for campo in colunas(m)
            if campo.column.endswith('_id')
        ]

        self.assertEqual(fora, [])

    def test_nenhuma_coluna_tem_palavra_em_ingles(self):
        fora = [
            f'{m._meta.db_table}.{campo.column}'
            for m in modelos_do_projeto()
            for campo in colunas(m)
            if PALAVRAS_EM_INGLES & set(re.split(r'_+', campo.column))
        ]

        self.assertEqual(fora, [])


class ListaFixaTravadaNoBancoTests(SimpleTestCase):
    """
    Campo com lista fixa de valores tem `CHECK` no banco, nao so no Django.

    A validacao da aplicacao nao alcanca o `INSERT` escrito a mao, o script de
    carga ou o console do Neon - e foi por um caminho desses que um membro da
    rede ficou com `disponibilidade = 'ativo'`, valor que nenhuma tela entende.
    """

    def test_todo_campo_de_lista_fixa_tem_check_com_os_mesmos_valores(self):
        faltando = []

        for modelo in modelos_do_projeto():
            restricoes = {
                restricao.name: restricao
                for restricao in modelo._meta.constraints
                if isinstance(restricao, models.CheckConstraint)
            }

            for campo in colunas(modelo):
                if not campo.choices or isinstance(campo, models.BooleanField):
                    continue

                nome = f'ck_{modelo._meta.db_table}_{campo.column}'
                esperado = models.Q(
                    **{f'{campo.name}__in': [valor for valor, _ in campo.flatchoices]}
                )

                if restricoes.get(nome) is None or restricoes[nome].condition != esperado:
                    faltando.append(nome)

        self.assertEqual(faltando, [])
