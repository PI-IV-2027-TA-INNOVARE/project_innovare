"""
Decisao do Supervisor (RF11 / RN-A07) - o fecho do fluxo (D03).

Nenhuma task assincrona registra uma decisao. E a unica seta do fluxo que
automacao alguma percorre sozinha.
"""
from django.db import models


class TipoDecisao(models.TextChoices):
    CONTINUAR = 'continuar', 'Continuar'
    REVISAR = 'revisar', 'Revisar'
    ARQUIVAR = 'arquivar', 'Arquivar'


class Decisao(models.Model):
    """
    1:N e nao 1:1: uma oportunidade que recebeu "Revisar" volta ao fluxo e sera
    decidida de novo - e as duas decisoes precisam sobreviver.
    """

    id_decisao = models.BigAutoField(primary_key=True, db_column='id_decisao')
    oportunidade = models.ForeignKey(
        'opportunities.Oportunidade',
        on_delete=models.CASCADE,
        related_name='decisoes',
        db_column='id_oportunidade',
    )
    tipo = models.CharField(
        max_length=10, choices=TipoDecisao.choices, db_column='tipo'
    )
    justificativa = models.TextField(db_column='justificativa')
    autor = models.ForeignKey(
        'accounts.Usuario',
        on_delete=models.PROTECT,
        related_name='decisoes',
        db_column='id_autor',
    )
    pre_analise = models.ForeignKey(
        'maturity.PreAnalise',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='decisoes',
        db_column='id_pre_analise',
    )
    registrada_em = models.DateTimeField(auto_now_add=True, db_column='registrada_em')

    class Meta:
        db_table = 'decisao'
        verbose_name_plural = 'decisoes'
        ordering = ['-registrada_em']
        indexes = [
            models.Index(
                fields=['oportunidade', '-registrada_em'],
                name='idx_decisao_oportunidade',
            ),
        ]

    def __str__(self):
        return f'{self.get_tipo_display()} em {self.oportunidade_id}'
