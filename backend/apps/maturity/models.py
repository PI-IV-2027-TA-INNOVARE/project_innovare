"""
Pre-analise de maturidade PIPE/FAPESP (RF09, RF10).

Vocabulario e schema: nenhuma coluna se chama `nota`, `parecer`, `aprovacao` ou
`score`. O resultado e *orientativo* (AGENTS.md 0.2) e o nome da coluna e onde
o desvio comecaria.
"""
import uuid

from django.db import models

from core.models import CoerenteComAPreAnalise, lista_fixa

from apps.ai.models import StatusExecucao


class DimensaoMaturidade(models.TextChoices):
    """As seis dimensoes de referencia do glossario (`CONTEXT.md` secao 4)."""

    DESAFIO_TECNOLOGICO = 'desafio_tecnologico', 'Desafio tecnológico'
    INOVACAO = 'inovacao', 'Inovação'
    PLANO_PESQUISA = 'plano_pesquisa', 'Plano de pesquisa'
    EQUIPE_SUPERVISAO = 'equipe_supervisao', 'Equipe e supervisão'
    INFRAESTRUTURA = 'infraestrutura', 'Infraestrutura'
    VIABILIDADE = 'viabilidade', 'Viabilidade'


class NivelDimensao(models.TextChoices):
    """Rotulo orientativo, jamais uma nota."""

    CONSOLIDADA = 'consolidada', 'Consolidada'
    EM_DESENVOLVIMENTO = 'em_desenvolvimento', 'Em desenvolvimento'
    FRAGIL = 'fragil', 'Frágil'


class OrigemRecomendacao(models.TextChoices):
    COPILOTO = 'copiloto', 'Copiloto'
    PRE_ANALISE = 'pre_analise', 'Pré-análise'
    MANUAL = 'manual', 'Manual'


class VersaoCriterio(models.Model):
    """
    Uma versao dos criterios da Base de Conhecimento PIPE (`V2`).

    A vigencia e da versao, nao de cada criterio: guardada nas 23 linhas de
    uma versao, ela se repetia e podia divergir entre elas (3FN). E a
    pre-analise aponta para ca por chave, e nao pelo rotulo em texto, para que
    nao exista analise citando versao que nunca foi cadastrada.
    """

    id_versao_criterio = models.BigAutoField(
        primary_key=True, db_column='id_versao_criterio'
    )
    versao = models.CharField(max_length=12, unique=True, db_column='versao')
    baseline = models.CharField(
        max_length=60, blank=True, default='', db_column='baseline'
    )
    vigente_de = models.DateField(db_column='vigente_de')
    vigente_ate = models.DateField(null=True, blank=True, db_column='vigente_ate')

    class Meta:
        db_table = 'Versao_Criterio_Pipe'
        verbose_name = 'versao dos criterios de pre-analise'
        verbose_name_plural = 'versoes dos criterios de pre-analise'
        ordering = ['-vigente_de', 'versao']
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(vigente_ate__isnull=True)
                    | models.Q(vigente_ate__gte=models.F('vigente_de'))
                ),
                name='ck_versao_criterio_pipe_vigencia',
            ),
        ]

    def __str__(self):
        return self.versao


class CriterioPreAnalise(models.Model):
    """
    Criterios *versionados*.

    Uma analise feita em outubro precisa continuar legivel em dezembro, mesmo
    que os criterios tenham mudado no meio. Conteudo e P4 (PO + AC2).
    """

    id_criterio = models.BigAutoField(primary_key=True, db_column='id_criterio')
    versao_criterio = models.ForeignKey(
        VersaoCriterio,
        on_delete=models.PROTECT,
        related_name='criterios',
        db_column='id_versao_criterio',
    )
    dimensao = models.CharField(
        max_length=24, choices=DimensaoMaturidade.choices, db_column='dimensao'
    )
    codigo = models.CharField(max_length=40, db_column='codigo')
    descricao = models.TextField(db_column='descricao')
    peso = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, db_column='peso'
    )

    class Meta:
        db_table = 'Criterio_Referencia_Pipe'
        verbose_name = 'criterio de pre-analise'
        verbose_name_plural = 'criterios de pre-analise'
        ordering = ['versao_criterio', 'dimensao', 'codigo']
        constraints = [
            lista_fixa('criterio_referencia_pipe', 'dimensao', DimensaoMaturidade),
            models.UniqueConstraint(
                fields=['versao_criterio', 'codigo'],
                name='uq_criterio_versao_codigo',
            ),
        ]

    @property
    def versao(self):
        return self.versao_criterio.versao


class PreAnalise(models.Model):
    """
    Uma execucao.

    RF10 pede reavaliacao apos a evolucao da proposta - logo nao e 1:1 com a
    oportunidade, e 1:N com a ultima em destaque.
    """

    id_pre_analise = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False, db_column='id_pre_analise'
    )
    proposta = models.ForeignKey(
        'copilot.PropostaEstruturada',
        on_delete=models.CASCADE,
        related_name='pre_analises',
        db_column='id_proposta',
    )
    versao_criterio = models.ForeignKey(
        VersaoCriterio,
        on_delete=models.PROTECT,
        related_name='pre_analises',
        db_column='id_versao_criterio',
    )
    versao_proposta = models.PositiveIntegerField(db_column='versao_proposta')
    sintese = models.TextField(blank=True, default='', db_column='sintese')
    executada_em = models.DateTimeField(
        auto_now_add=True, db_column='data_execucao'
    )
    executada_por = models.CharField(
        max_length=160, default='__sistema__', db_column='executada_por'
    )
    execucao_ia = models.ForeignKey(
        'ai.ExecucaoIA',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='pre_analises',
        db_column='id_execucao_ia',
    )
    status = models.CharField(
        max_length=12,
        choices=StatusExecucao.choices,
        default=StatusExecucao.PENDENTE,
        db_column='status',
    )
    erro = models.TextField(blank=True, default='', db_column='erro')

    class Meta:
        db_table = 'Pre_Analise_Maturidade'
        constraints = [
            lista_fixa('pre_analise_maturidade', 'status', StatusExecucao),
        ]
        verbose_name = 'pre-analise'
        verbose_name_plural = 'pre-analises'
        ordering = ['-executada_em']

    @property
    def versao_criterios(self):
        """O rotulo (`V2`) que o relatorio e a API mostram."""
        return self.versao_criterio.versao


class PreAnaliseDimensao(models.Model):
    """A avaliacao por dimensao - como o Relatorio de Maturidade se apresenta."""

    id_dimensao = models.BigAutoField(primary_key=True, db_column='id_dimensao')
    pre_analise = models.ForeignKey(
        PreAnalise,
        on_delete=models.CASCADE,
        related_name='dimensoes',
        db_column='id_pre_analise',
    )
    dimensao = models.CharField(
        max_length=24,
        choices=DimensaoMaturidade.choices,
        db_column='nome_dimensao',
    )
    avaliacao = models.TextField(db_column='observacoes')
    nivel = models.CharField(
        max_length=20, choices=NivelDimensao.choices, db_column='nivel_maturidade'
    )
    evidencias = models.JSONField(default=list, db_column='evidencias')
    ordem = models.PositiveSmallIntegerField(default=0, db_column='ordem')

    class Meta:
        db_table = 'Dimensao_Analise'
        verbose_name = 'dimensao da pre-analise'
        verbose_name_plural = 'dimensoes da pre-analise'
        ordering = ['pre_analise', 'ordem']
        constraints = [
            lista_fixa(
                'dimensao_analise', 'dimensao', DimensaoMaturidade,
                coluna='nome_dimensao',
            ),
            lista_fixa(
                'dimensao_analise', 'nivel', NivelDimensao,
                coluna='nivel_maturidade',
            ),
            models.UniqueConstraint(
                fields=['pre_analise', 'dimensao'],
                name='uq_pre_analise_dimensao',
            ),
        ]


class Recomendacao(CoerenteComAPreAnalise, models.Model):
    """O par positivo da lacuna: o que fazer a respeito."""

    id_recomendacao = models.BigAutoField(
        primary_key=True, db_column='id_recomendacao'
    )
    oportunidade = models.ForeignKey(
        'opportunities.Oportunidade',
        on_delete=models.CASCADE,
        related_name='recomendacoes',
        db_column='id_oportunidade',
    )
    origem = models.CharField(
        max_length=12, choices=OrigemRecomendacao.choices, db_column='origem'
    )
    pre_analise = models.ForeignKey(
        PreAnalise,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='recomendacoes',
        db_column='id_pre_analise',
    )
    lacuna = models.ForeignKey(
        'copilot.Lacuna',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='recomendacoes',
        db_column='id_lacuna',
    )
    texto = models.TextField(db_column='descricao')
    acatada = models.BooleanField(default=False, db_column='acatada')
    acatada_em = models.DateTimeField(null=True, blank=True, db_column='acatada_em')
    execucao_ia = models.ForeignKey(
        'ai.ExecucaoIA',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='recomendacoes',
        db_column='id_execucao_ia',
    )
    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')

    class Meta:
        db_table = 'Recomendacao_Adequacao'
        constraints = [
            lista_fixa('recomendacao_adequacao', 'origem', OrigemRecomendacao),
        ]
        verbose_name_plural = 'recomendacoes'
        ordering = ['-criado_em']
