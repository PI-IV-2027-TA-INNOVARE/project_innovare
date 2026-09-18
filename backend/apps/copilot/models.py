"""
Copiloto de Estruturacao e Proposta Estruturada (RF04, RF05).

A IA e apoio, nunca autoridade (AGENTS.md 0.2): tudo que sai daqui e revisavel
e editavel por humano antes de virar decisao.
"""
import uuid

from django.db import models

from core.models import ModeloComCarimbo


class EstadoSessao(models.TextChoices):
    ABERTA = 'aberta', 'Aberta'
    CONCLUIDA = 'concluida', 'Concluida'
    ABANDONADA = 'abandonada', 'Abandonada'


class AutorMensagem(models.TextChoices):
    COPILOTO = 'copiloto', 'Copiloto'
    HUMANO = 'humano', 'Humano'


class TipoLacuna(models.TextChoices):
    """O glossario define tres usos para "lacuna" (`CONTEXT.md` secao 4)."""

    PROPOSTA = 'proposta', 'Lacuna da proposta'
    COMPETENCIA = 'competencia', 'Lacuna de competencia'
    PRE_ANALISE = 'pre_analise', 'Lacuna da pre-analise'


class Severidade(models.TextChoices):
    ALTA = 'alta', 'Alta'
    MEDIA = 'media', 'Media'
    BAIXA = 'baixa', 'Baixa'


class PropostaEstruturada(ModeloComCarimbo):
    """
    Os oito elementos que o RF04 nomeia, em colunas proprias.

    Nao num JSON opaco: cada elemento e editado, versionado e citado pela
    pre-analise.
    """

    id_proposta = models.BigAutoField(primary_key=True, db_column='id_proposta')
    oportunidade = models.OneToOneField(
        'opportunities.Oportunidade',
        on_delete=models.CASCADE,
        related_name='proposta',
        db_column='id_oportunidade',
    )
    problema_pesquisa = models.TextField(
        blank=True, default='', db_column='problema_pesquisa'
    )
    hipotese = models.TextField(null=True, blank=True, db_column='hipotese')
    objetivo_geral = models.TextField(
        blank=True, default='', db_column='objetivo_geral'
    )
    objetivos_especificos = models.JSONField(
        default=list, db_column='objetivos_especificos'
    )
    metodologia = models.TextField(blank=True, default='', db_column='metodologia')
    resultados_esperados = models.TextField(
        blank=True, default='', db_column='resultados_esperados'
    )
    caracterizacao_inovacao = models.TextField(
        blank=True, default='', db_column='caracterizacao_inovacao'
    )
    infraestrutura_recursos = models.TextField(
        blank=True, default='', db_column='infraestrutura_recursos'
    )
    versao = models.PositiveIntegerField(default=1, db_column='versao')
    revisada_por_humano = models.BooleanField(
        default=False, db_column='revisada_por_humano'
    )
    revisor = models.ForeignKey(
        'accounts.Usuario',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='propostas_revisadas',
        db_column='id_revisor',
    )
    execucao_ia = models.ForeignKey(
        'ai.ExecucaoIA',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='propostas',
        db_column='id_execucao_ia',
    )

    class Meta:
        db_table = 'proposta_estruturada'
        verbose_name = 'proposta estruturada'
        verbose_name_plural = 'propostas estruturadas'

    def __str__(self):
        return f'Proposta v{self.versao} de {self.oportunidade_id}'


class SessaoCopiloto(models.Model):
    """
    Uma conversa de estruturacao.

    Uma oportunidade pode ter varias ao longo do tempo - reestruturar depois de
    um "Revisar" e o caso previsto.
    """

    id_sessao = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False, db_column='id_sessao'
    )
    oportunidade = models.ForeignKey(
        'opportunities.Oportunidade',
        on_delete=models.CASCADE,
        related_name='sessoes_copiloto',
        db_column='id_oportunidade',
    )
    iniciada_por = models.ForeignKey(
        'accounts.Usuario',
        null=True,
        on_delete=models.SET_NULL,
        related_name='sessoes_copiloto',
        db_column='iniciada_por',
    )
    estado = models.CharField(
        max_length=12,
        choices=EstadoSessao.choices,
        default=EstadoSessao.ABERTA,
        db_column='estado',
    )
    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')
    encerrado_em = models.DateTimeField(
        null=True, blank=True, db_column='encerrado_em'
    )

    class Meta:
        db_table = 'sessao_copiloto'
        verbose_name = 'sessao do copiloto'
        verbose_name_plural = 'sessoes do copiloto'
        ordering = ['-criado_em']


class MensagemCopiloto(models.Model):
    """
    As perguntas orientadoras e as respostas humanas.

    E o material que reconstroi *por que* a proposta ficou como ficou.
    """

    id_mensagem = models.BigAutoField(primary_key=True, db_column='id_mensagem')
    sessao = models.ForeignKey(
        SessaoCopiloto,
        on_delete=models.CASCADE,
        related_name='mensagens',
        db_column='id_sessao',
    )
    autor = models.CharField(
        max_length=10, choices=AutorMensagem.choices, db_column='autor'
    )
    conteudo = models.TextField(db_column='conteudo')
    ordem = models.PositiveIntegerField(db_column='ordem')
    execucao_ia = models.ForeignKey(
        'ai.ExecucaoIA',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='mensagens_copiloto',
        db_column='id_execucao_ia',
    )
    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')

    class Meta:
        db_table = 'mensagem_copiloto'
        verbose_name = 'mensagem do copiloto'
        verbose_name_plural = 'mensagens do copiloto'
        ordering = ['sessao', 'ordem']
        constraints = [
            models.UniqueConstraint(
                fields=['sessao', 'ordem'], name='uq_mensagem_sessao_ordem'
            ),
        ]


class Lacuna(models.Model):
    """Uma tabela com discriminador para os tres usos do termo no glossario."""

    id_lacuna = models.BigAutoField(primary_key=True, db_column='id_lacuna')
    oportunidade = models.ForeignKey(
        'opportunities.Oportunidade',
        on_delete=models.CASCADE,
        related_name='lacunas',
        db_column='id_oportunidade',
    )
    tipo = models.CharField(
        max_length=12, choices=TipoLacuna.choices, db_column='tipo'
    )
    descricao = models.TextField(db_column='descricao')
    severidade = models.CharField(
        max_length=6, choices=Severidade.choices, null=True, blank=True,
        db_column='severidade',
    )
    competencia_necessaria = models.ForeignKey(
        'competencies.CompetenciaNecessaria',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='lacunas',
        db_column='id_competencia_necessaria',
    )
    pre_analise = models.ForeignKey(
        'maturity.PreAnalise',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='lacunas',
        db_column='id_pre_analise',
    )
    resolvida = models.BooleanField(default=False, db_column='resolvida')
    resolvida_em = models.DateTimeField(
        null=True, blank=True, db_column='resolvida_em'
    )
    execucao_ia = models.ForeignKey(
        'ai.ExecucaoIA',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='lacunas',
        db_column='id_execucao_ia',
    )
    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')

    class Meta:
        db_table = 'lacuna'
        verbose_name_plural = 'lacunas'
        indexes = [
            models.Index(
                fields=['oportunidade', 'tipo', 'resolvida'],
                name='idx_lacuna_oport_tipo',
            ),
        ]
