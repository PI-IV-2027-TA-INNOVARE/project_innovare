"""
Matching e Equipe Potencial (RF06, RF07, RF08).

O matching gera *sugestoes*. Nunca convocacao, contratacao ou aceite
(RN-A06 / D07).
"""
import uuid

from django.db import models

from apps.ai.models import StatusExecucao
from apps.network.models import PapelNaRede


class OrigemIndicacao(models.TextChoices):
    IA = 'ia', 'Sugerida pelo matching'
    MANUAL = 'manual', 'Adicionada pelo Supervisor'


class ExecucaoMatching(models.Model):
    """
    Cada rodada e um registro.

    Sem isso, "por que este pesquisador apareceu semana passada e sumiu hoje"
    nao tem resposta.
    """

    id_execucao = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False, db_column='id_execucao'
    )
    oportunidade = models.ForeignKey(
        'opportunities.Oportunidade',
        on_delete=models.CASCADE,
        related_name='execucoes_matching',
        db_column='id_oportunidade',
    )
    estrategia = models.CharField(max_length=60, db_column='estrategia')
    pesos = models.JSONField(default=dict, db_column='pesos')
    versao_modelo = models.CharField(
        max_length=120, blank=True, default='', db_column='versao_modelo'
    )
    usou_rerank = models.BooleanField(default=False, db_column='usou_rerank')
    fallback_usado = models.BooleanField(default=False, db_column='fallback_usado')
    executado_por = models.CharField(
        max_length=160, default='__sistema__', db_column='executado_por'
    )
    status = models.CharField(
        max_length=12,
        choices=StatusExecucao.choices,
        default=StatusExecucao.PENDENTE,
        db_column='status',
    )
    erro = models.TextField(blank=True, default='', db_column='erro')
    execucao_ia = models.ForeignKey(
        'ai.ExecucaoIA',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='execucoes_matching',
        db_column='id_execucao_ia',
    )
    iniciado_em = models.DateTimeField(auto_now_add=True, db_column='iniciado_em')
    concluido_em = models.DateTimeField(
        null=True, blank=True, db_column='concluido_em'
    )

    class Meta:
        db_table = 'execucao_matching'
        verbose_name = 'execucao de matching'
        verbose_name_plural = 'execucoes de matching'
        ordering = ['-iniciado_em']


class EquipePotencial(models.Model):
    """
    A composicao sugerida.

    Ausencia deliberada: nao ha `status` de aceite/recusa e nao ha coluna que o
    pesquisador escreva. RN-A06 / D07 dizem que nao existe convite - e a forma
    mais confiavel de garantir isso e nao haver onde gravar.
    """

    id_equipe_potencial = models.BigAutoField(
        primary_key=True, db_column='id_equipe_potencial'
    )
    oportunidade = models.ForeignKey(
        'opportunities.Oportunidade',
        on_delete=models.CASCADE,
        related_name='equipe_potencial',
        db_column='id_oportunidade',
    )
    membro = models.ForeignKey(
        'network.MembroRede',
        on_delete=models.PROTECT,
        related_name='indicacoes',
        db_column='id_membro',
    )
    execucao = models.ForeignKey(
        ExecucaoMatching,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='indicacoes',
        db_column='id_execucao',
    )
    papel_sugerido = models.CharField(
        max_length=16, choices=PapelNaRede.choices, db_column='papel_sugerido'
    )
    score_match = models.DecimalField(
        max_digits=5, decimal_places=4, null=True, blank=True, db_column='score_match'
    )
    match_reasons = models.JSONField(default=list, db_column='match_reasons')
    score_features = models.JSONField(default=dict, db_column='score_features')
    origem = models.CharField(
        max_length=8,
        choices=OrigemIndicacao.choices,
        default=OrigemIndicacao.IA,
        db_column='origem',
    )
    validada = models.BooleanField(default=False, db_column='validada')
    ajustado_por = models.ForeignKey(
        'accounts.Usuario',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='equipes_ajustadas',
        db_column='ajustado_por',
    )
    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')
    atualizado_em = models.DateTimeField(auto_now=True, db_column='atualizado_em')

    class Meta:
        db_table = 'equipe_potencial'
        verbose_name = 'indicacao de equipe potencial'
        verbose_name_plural = 'equipe potencial'
        ordering = ['-score_match']
        constraints = [
            models.UniqueConstraint(
                fields=['oportunidade', 'membro'],
                name='uq_equipe_oportunidade_membro',
            ),
        ]
        indexes = [
            models.Index(
                fields=['membro', 'validada'], name='idx_equipe_membro_validada'
            ),
        ]
