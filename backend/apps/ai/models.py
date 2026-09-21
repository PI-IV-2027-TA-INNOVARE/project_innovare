"""
Rastreabilidade das execucoes de IA.

Uma linha por chamada a provedor. Todas as tabelas que teriam um `ai_run_id`
solto apontam para ca - e e a mesma tabela que responde quanto o mes ja custou
contra o teto de `AI_CUSTO_TETO_MENSAL_BRL` (`CONTEXT.md` secao 2).
"""
import uuid

from django.db import models


class TipoExecucaoIA(models.TextChoices):
    COPILOTO = 'copiloto', 'Copiloto de estruturacao'
    COMPETENCIAS = 'competencias', 'Derivacao de competencias'
    MATCHING = 'matching', 'Matching'
    PREANALISE = 'preanalise', 'Pre-analise de maturidade'
    EMBEDDING = 'embedding', 'Geracao de embedding'


class StatusExecucao(models.TextChoices):
    PENDENTE = 'pendente', 'Pendente'
    EXECUTANDO = 'executando', 'Executando'
    OK = 'ok', 'Concluida'
    ERRO = 'erro', 'Erro'


class ExecucaoIA(models.Model):
    id_execucao_ia = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False, db_column='id_execucao_ia'
    )
    tipo = models.CharField(
        max_length=16, choices=TipoExecucaoIA.choices, db_column='tipo'
    )
    provedor = models.CharField(max_length=40, db_column='provedor')
    modelo = models.CharField(max_length=80, db_column='modelo')
    versao_prompt = models.CharField(
        max_length=40, blank=True, default='', db_column='versao_prompt'
    )
    tokens_entrada = models.IntegerField(
        null=True, blank=True, db_column='tokens_entrada'
    )
    tokens_saida = models.IntegerField(
        null=True, blank=True, db_column='tokens_saida'
    )
    custo_estimado = models.DecimalField(
        max_digits=10, decimal_places=6, null=True, blank=True,
        db_column='custo_estimado',
    )
    latencia_ms = models.IntegerField(null=True, blank=True, db_column='latencia_ms')
    status = models.CharField(
        max_length=12,
        choices=StatusExecucao.choices,
        default=StatusExecucao.PENDENTE,
        db_column='status',
    )
    fallback_usado = models.BooleanField(default=False, db_column='fallback_usado')
    erro = models.TextField(blank=True, default='', db_column='erro')
    correlation_id = models.UUIDField(
        default=uuid.uuid4, db_column='correlation_id'
    )
    executado_por = models.CharField(
        max_length=160, default='__sistema__', db_column='executado_por'
    )
    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')
    concluido_em = models.DateTimeField(
        null=True, blank=True, db_column='concluido_em'
    )

    class Meta:
        db_table = 'execucao_ia'
        verbose_name = 'execucao de IA'
        verbose_name_plural = 'execucoes de IA'
        indexes = [
            models.Index(fields=['correlation_id'], name='idx_execia_correlation'),
            models.Index(
                fields=['criado_em'],
                condition=models.Q(status='ok'),
                name='idx_execia_consumo_ok',
            ),
        ]

    def __str__(self):
        return f'{self.tipo} via {self.provedor}/{self.modelo}'
