"""Bases de persistencia compartilhadas por todos os apps de dominio."""
from django.db import models


class ModeloComCarimbo(models.Model):
    """
    Toda tabela de dominio carrega `criado_em` e `atualizado_em`.

    Convencao do plano de banco (B0): nomes em portugues em `db_table` e
    `db_column`; PK explicita `id_<tabela>` declarada em cada modelo concreto.
    """

    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')
    atualizado_em = models.DateTimeField(auto_now=True, db_column='atualizado_em')

    class Meta:
        abstract = True
