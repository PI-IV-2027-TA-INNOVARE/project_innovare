"""
Organizacoes.

Uma tabela para os dois vinculos institucionais que a UI mostra no mesmo campo:
a empresa demandante (Problema Externo) e a instituicao do membro da rede.
"""
from django.db import models

from core.models import ModeloComCarimbo


class TipoOrganizacao(models.TextChoices):
    DEMANDANTE = 'demandante', 'Organizacao demandante'
    INSTITUICAO = 'instituicao', 'Instituicao de vinculo'


class Organizacao(ModeloComCarimbo):
    id_organizacao = models.BigAutoField(primary_key=True, db_column='id_organizacao')
    tipo = models.CharField(
        max_length=12, choices=TipoOrganizacao.choices, db_column='tipo'
    )
    nome = models.CharField(max_length=180, db_column='nome')
    razao_social = models.CharField(
        max_length=200, null=True, blank=True, db_column='razao_social'
    )
    cnpj = models.CharField(
        max_length=14, null=True, blank=True, unique=True, db_column='cnpj'
    )
    municipio = models.CharField(
        max_length=120, null=True, blank=True, db_column='municipio'
    )
    uf = models.CharField(max_length=2, null=True, blank=True, db_column='uf')
    ativo = models.BooleanField(default=True, db_column='ativo')

    class Meta:
        db_table = 'organizacao'
        verbose_name = 'organizacao'
        verbose_name_plural = 'organizacoes'
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(tipo='demandante', cnpj__isnull=False)
                    | models.Q(tipo='instituicao')
                ),
                name='ck_organizacao_demandante_tem_cnpj',
            ),
        ]

    def __str__(self):
        return self.nome
