"""
Competencias necessarias (RF05).

A ponte entre a proposta e a rede. E esta tabela que muda a natureza do
matching: no modelo antigo o match comparava o texto livre da pesquisa; aqui
compara competencias derivadas da proposta e revisaveis pelo Supervisor.
"""
from django.db import models


class DerivadaDe(models.TextChoices):
    COPILOTO = 'copiloto', 'Derivada pelo Copiloto'
    MANUAL = 'manual', 'Informada manualmente'


class CompetenciaNecessaria(models.Model):
    id_competencia_necessaria = models.BigAutoField(
        primary_key=True, db_column='id_competencia_necessaria'
    )
    oportunidade = models.ForeignKey(
        'opportunities.Oportunidade',
        on_delete=models.CASCADE,
        related_name='competencias_necessarias',
        db_column='id_oportunidade',
    )
    competencia = models.ForeignKey(
        'network.Competencia',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='exigida_em',
        db_column='id_competencia',
    )
    descricao = models.CharField(max_length=200, db_column='descricao')
    essencial = models.BooleanField(default=True, db_column='essencial')
    derivada_de = models.CharField(
        max_length=10,
        choices=DerivadaDe.choices,
        default=DerivadaDe.COPILOTO,
        db_column='derivada_de',
    )
    execucao_ia = models.ForeignKey(
        'ai.ExecucaoIA',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='competencias_derivadas',
        db_column='id_execucao_ia',
    )
    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')
    atualizado_em = models.DateTimeField(auto_now=True, db_column='atualizado_em')

    class Meta:
        db_table = 'competencia_necessaria'
        verbose_name = 'competencia necessaria'
        verbose_name_plural = 'competencias necessarias'
        constraints = [
            models.UniqueConstraint(
                fields=['oportunidade', 'descricao'],
                name='uq_competencia_necessaria_oport_desc',
            ),
        ]

    def __str__(self):
        return self.descricao
