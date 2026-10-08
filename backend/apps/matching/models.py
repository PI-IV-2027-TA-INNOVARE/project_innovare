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
    O cabecalho da composicao sugerida: uma geracao de equipe.

    Ausencia deliberada, aqui e em `MembroEquipe`: nao ha `status` de aceite ou
    recusa, nem coluna que o pesquisador escreva. RN-A06 / D07 dizem que nao
    existe convite - a forma mais confiavel de garantir isso e nao haver onde
    gravar.
    """

    id_equipe = models.BigAutoField(primary_key=True, db_column='id_equipe')
    oportunidade = models.ForeignKey(
        'opportunities.Oportunidade',
        on_delete=models.CASCADE,
        related_name='equipes_potenciais',
        db_column='id_oportunidade',
    )
    execucao = models.ForeignKey(
        ExecucaoMatching,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='equipes',
        db_column='id_execucao',
    )
    data_geracao = models.DateTimeField(auto_now_add=True, db_column='data_geracao')

    class Meta:
        db_table = 'equipe_potencial'
        verbose_name = 'equipe potencial'
        verbose_name_plural = 'equipes potenciais'
        ordering = ['-data_geracao']

    def __str__(self):
        return f'Equipe da oportunidade {self.oportunidade_id}'


class MembroEquipe(models.Model):
    """
    A pessoa indicada para a equipe.

    Aponta para `MembroRede`, e nao para `Usuario` como o diagrama desenha: a
    RN-A04 permite indicar quem ainda nao tem conta, e exigir usuario aqui
    excluiria do matching justamente quem o Supervisor acabou de cadastrar.
    """

    id_membro_equipe = models.BigAutoField(
        primary_key=True, db_column='id_membro_equipe'
    )
    equipe = models.ForeignKey(
        EquipePotencial,
        on_delete=models.CASCADE,
        related_name='membros',
        db_column='id_equipe',
    )
    membro = models.ForeignKey(
        'network.MembroRede',
        on_delete=models.PROTECT,
        related_name='indicacoes',
        db_column='id_membro',
    )
    papel = models.CharField(
        max_length=16, choices=PapelNaRede.choices, db_column='papel'
    )
    score_compatibilidade = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        null=True,
        blank=True,
        db_column='score_compatibilidade',
    )
    justificativa = models.TextField(blank=True, default='', db_column='justificativa')
    match_reasons = models.JSONField(default=list, db_column='match_reasons')
    score_features = models.JSONField(default=dict, db_column='score_features')
    incluido = models.BooleanField(default=True, db_column='incluido')
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
        db_table = 'membro_equipe'
        verbose_name = 'membro da equipe potencial'
        verbose_name_plural = 'membros da equipe potencial'
        ordering = ['-score_compatibilidade']
        constraints = [
            models.UniqueConstraint(
                fields=['equipe', 'membro'], name='uq_membro_equipe'
            ),
        ]
        indexes = [
            models.Index(
                fields=['membro', 'validada'], name='idx_membro_equipe_validada'
            ),
        ]

    def __str__(self):
        return f'{self.membro_id} na equipe {self.equipe_id}'


class LacunaCompetenciaEquipe(models.Model):
    """
    O que a equipe sugerida nao cobre (classe do diagrama).

    Vive ao lado de `MembroEquipe`, e nao junto da proposta, porque a lacuna e
    da composicao: a mesma proposta gera equipes diferentes, com lacunas
    diferentes.
    """

    id_lacuna_equipe = models.BigAutoField(
        primary_key=True, db_column='id_lacuna_equipe'
    )
    equipe = models.ForeignKey(
        EquipePotencial,
        on_delete=models.CASCADE,
        related_name='lacunas',
        db_column='id_equipe',
    )
    descricao = models.TextField(db_column='descricao')
    competencia_necessaria = models.ForeignKey(
        'competencies.CompetenciaNecessaria',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='lacunas_equipe',
        db_column='id_competencia_necessaria',
    )
    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')

    class Meta:
        db_table = 'lacuna_competencia_equipe'
        verbose_name = 'lacuna de competencia da equipe'
        verbose_name_plural = 'lacunas de competencia da equipe'

    def __str__(self):
        return f'Lacuna da equipe {self.equipe_id}'
