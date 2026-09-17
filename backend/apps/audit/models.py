"""
Trilha de auditoria (RF12) - append-only.

Nunca e atualizada nem apagada pela aplicacao. E a fonte unica da aba Historico
da oportunidade: duas tabelas para a mesma verdade divergem no primeiro mes.
"""
import uuid

from django.db import models


class CategoriaEvento(models.TextChoices):
    """As categorias sao as que a aba Historico do front ja usa."""

    OPORTUNIDADE = 'oportunidade', 'Oportunidade'
    COPILOTO = 'copiloto', 'Copiloto'
    COMPETENCIA = 'competencia', 'Competencia'
    MATCHING = 'matching', 'Matching'
    PREANALISE = 'preanalise', 'Pre-analise'
    DECISAO = 'decisao', 'Decisao'
    REDE = 'rede', 'Rede interna'
    CONTA = 'conta', 'Conta e acesso'
    CONFIG = 'config', 'Configuracao'


class StatusEvento(models.TextChoices):
    OK = 'ok', 'Concluido'
    ERRO = 'erro', 'Erro'
    NEGADO = 'negado', 'Negado'


class EventoAuditoria(models.Model):
    id_evento = models.BigAutoField(primary_key=True, db_column='id_evento')
    ocorrido_em = models.DateTimeField(db_column='ocorrido_em')
    categoria = models.CharField(
        max_length=16, choices=CategoriaEvento.choices, db_column='categoria'
    )
    tipo = models.CharField(max_length=60, db_column='tipo')
    ator = models.CharField(max_length=160, db_column='ator')
    entidade = models.CharField(max_length=60, db_column='entidade')
    entidade_id = models.CharField(max_length=60, db_column='entidade_id')
    status = models.CharField(
        max_length=8,
        choices=StatusEvento.choices,
        default=StatusEvento.OK,
        db_column='status',
    )
    motivo = models.TextField(blank=True, default='', db_column='motivo')
    correlation_id = models.UUIDField(
        default=uuid.uuid4, db_column='correlation_id'
    )
    execucao_ia = models.ForeignKey(
        'ai.ExecucaoIA',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='eventos',
        db_column='id_execucao_ia',
    )
    detalhe = models.JSONField(default=dict, db_column='detalhe')
    registrado_em = models.DateTimeField(auto_now_add=True, db_column='registrado_em')

    class Meta:
        db_table = 'evento_auditoria'
        verbose_name = 'evento de auditoria'
        verbose_name_plural = 'eventos de auditoria'
        ordering = ['-ocorrido_em']
        indexes = [
            models.Index(
                fields=['entidade', 'entidade_id', '-ocorrido_em'],
                name='idx_evento_entidade',
            ),
            models.Index(fields=['correlation_id'], name='idx_evento_correlation'),
            models.Index(
                fields=['categoria', '-ocorrido_em'], name='idx_evento_categoria'
            ),
        ]

    def __str__(self):
        return f'{self.categoria}.{self.tipo} por {self.ator}'
