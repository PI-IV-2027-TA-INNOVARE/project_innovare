"""Bases de persistencia compartilhadas por todos os apps de dominio."""
from django.db import models

from core.exceptions import ErroDeDominio


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


class CoerenteComAPreAnalise:
    """
    Quem aponta para a oportunidade e para a pre-analise aponta para a mesma.

    `id_oportunidade` e obrigatoria porque ha registro sem pre-analise (a
    lacuna do Copiloto); `id_pre_analise` ja leva a oportunidade, pela
    proposta. Duas estradas para o mesmo lugar so sao seguras se nao puderem
    divergir, e o Postgres nao compara colunas de tabelas diferentes num
    CHECK - por isso a trava e aqui, e vale para qualquer caminho de escrita,
    admin do Django incluido.
    """

    def save(self, *args, **kwargs):
        self.garantir_mesma_oportunidade()
        super().save(*args, **kwargs)

    def garantir_mesma_oportunidade(self):
        if self.pre_analise_id is None:
            return

        da_analise = self.pre_analise.proposta.oportunidade_id

        if da_analise != self.oportunidade_id:
            raise ErroDeDominio(
                'A pre-analise informada pertence a outra oportunidade.',
                codigo='referencias_divergentes',
            )


def lista_fixa(tabela, campo, escolhas):
    """
    `CHECK` que trava a coluna nos valores da lista (`ck_<tabela>_<campo>`).

    O `choices` do Django so valida o que passa pela aplicacao. O `INSERT`
    escrito a mao e o script de carga chegam ao banco direto.
    """
    return models.CheckConstraint(
        condition=models.Q(**{f'{campo}__in': escolhas.values}),
        name=f'ck_{tabela}_{campo}',
    )
