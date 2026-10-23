"""
Copiloto de Estruturacao e Proposta Estruturada (RF04, RF05).

A IA e apoio, nunca autoridade (AGENTS.md 0.2): tudo que sai daqui e revisavel
e editavel por humano antes de virar decisao.
"""
import uuid

from django.db import models, transaction

from core.models import CoerenteComAPreAnalise, ModeloComCarimbo, lista_fixa


class EstadoSessao(models.TextChoices):
    ABERTA = 'aberta', 'Aberta'
    CONCLUIDA = 'concluida', 'Concluida'
    ABANDONADA = 'abandonada', 'Abandonada'


class AutorMensagem(models.TextChoices):
    COPILOTO = 'copiloto', 'Copiloto'
    HUMANO = 'humano', 'Humano'


class TipoLacuna(models.TextChoices):
    """Dois dos tres usos do glossario (`CONTEXT.md` secao 4). O terceiro, a
    lacuna de competencia, tem tabela propria no diagrama do Arquiteto:
    `matching.LacunaCompetenciaEquipe`. Ela e da equipe gerada, nao da
    oportunidade - a mesma proposta produz equipes com lacunas diferentes."""

    PROPOSTA = 'proposta', 'Lacuna da proposta'
    PRE_ANALISE = 'pre_analise', 'Lacuna da pre-analise'


class Severidade(models.TextChoices):
    ALTA = 'alta', 'Alta'
    MEDIA = 'media', 'Media'
    BAIXA = 'baixa', 'Baixa'


class PropostaEstruturada(ModeloComCarimbo):
    """
    Os oito elementos que o RF04 nomeia, em colunas proprias.

    Nao num JSON opaco: cada elemento e editado, versionado e citado pela
    pre-analise. Os objetivos especificos moram em `Objetivo_Especifico`, uma
    linha por objetivo; `objetivos_especificos` continua lendo e gravando a
    lista, e o `save` grava as linhas junto com a proposta.
    """

    _objetivos_pendentes = None

    id_proposta = models.BigAutoField(primary_key=True, db_column='id_proposta')
    oportunidade = models.OneToOneField(
        'opportunities.Oportunidade',
        on_delete=models.CASCADE,
        related_name='proposta',
        db_column='id_oportunidade',
    )
    problema_pesquisa = models.TextField(
        blank=True, default='', db_column='problema'
    )
    hipotese = models.TextField(null=True, blank=True, db_column='hipotese')
    objetivo_geral = models.TextField(
        blank=True, default='', db_column='objetivo_geral'
    )
    metodologia = models.TextField(blank=True, default='', db_column='metodologia')
    resultados_esperados = models.TextField(
        blank=True, default='', db_column='resultados_esperados'
    )
    caracterizacao_inovacao = models.TextField(
        blank=True, default='', db_column='inovacao'
    )
    infraestrutura_recursos = models.TextField(
        blank=True, default='', db_column='infraestrutura'
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
        db_table = 'Proposta_Estruturada'
        verbose_name = 'proposta estruturada'
        verbose_name_plural = 'propostas estruturadas'

    def __str__(self):
        return f'Proposta v{self.versao} de {self.oportunidade_id}'

    @property
    def objetivos_especificos(self):
        if self._objetivos_pendentes is not None:
            return list(self._objetivos_pendentes)

        if self.pk is None:
            return []

        return [objetivo.descricao for objetivo in self.objetivos.all()]

    @objetivos_especificos.setter
    def objetivos_especificos(self, valores):
        self._objetivos_pendentes = list(valores or [])

    def save(self, *args, **kwargs):
        with transaction.atomic():
            super().save(*args, **kwargs)

            if self._objetivos_pendentes is not None:
                self._gravar_objetivos()

    def _gravar_objetivos(self):
        self.objetivos.all().delete()
        ObjetivoEspecifico.objects.bulk_create(
            ObjetivoEspecifico(proposta=self, ordem=ordem, descricao=descricao)
            for ordem, descricao in enumerate(self._objetivos_pendentes, start=1)
        )
        self._objetivos_pendentes = None
        getattr(self, '_prefetched_objects_cache', {}).pop('objetivos', None)


class ObjetivoEspecifico(models.Model):
    """
    Um objetivo especifico da proposta, editado item a item pelo Supervisor.

    Uma linha por objetivo, e nao uma lista dentro da proposta: e o que a 1FN
    pede de um atributo com varios valores.
    """

    id_objetivo = models.BigAutoField(primary_key=True, db_column='id_objetivo')
    proposta = models.ForeignKey(
        PropostaEstruturada,
        on_delete=models.CASCADE,
        related_name='objetivos',
        db_column='id_proposta',
    )
    ordem = models.PositiveSmallIntegerField(db_column='ordem')
    descricao = models.TextField(db_column='descricao')

    class Meta:
        db_table = 'Objetivo_Especifico'
        verbose_name = 'objetivo especifico'
        verbose_name_plural = 'objetivos especificos'
        ordering = ['ordem']
        constraints = [
            models.UniqueConstraint(
                fields=['proposta', 'ordem'], name='uq_objetivo_proposta_ordem'
            ),
        ]

    def __str__(self):
        return self.descricao


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
        db_column='id_iniciada_por',
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
        db_table = 'Sessao_Copiloto'
        constraints = [
            lista_fixa('sessao_copiloto', 'estado', EstadoSessao),
        ]
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
        db_table = 'Mensagem_Copiloto'
        verbose_name = 'mensagem do copiloto'
        verbose_name_plural = 'mensagens do copiloto'
        ordering = ['sessao', 'ordem']
        constraints = [
            lista_fixa('mensagem_copiloto', 'autor', AutorMensagem),
            models.UniqueConstraint(
                fields=['sessao', 'ordem'], name='uq_mensagem_sessao_ordem'
            ),
        ]


class Lacuna(CoerenteComAPreAnalise, models.Model):
    """
    Uma tabela com discriminador para os tres usos do termo no glossario.

    Pende da proposta, como no diagrama: a lacuna e calculada sobre ela (um
    elemento vazio ou fraco), e a proposta ja existe quando a lacuna nasce.
    """

    pende_da_proposta = True

    id_lacuna = models.BigAutoField(primary_key=True, db_column='id_lacuna')
    proposta = models.ForeignKey(
        PropostaEstruturada,
        on_delete=models.CASCADE,
        related_name='lacunas',
        db_column='id_proposta',
    )
    tipo = models.CharField(
        max_length=12, choices=TipoLacuna.choices, db_column='tipo'
    )
    campo_afetado = models.CharField(
        max_length=120, blank=True, default='', db_column='campo_afetado'
    )
    descricao = models.TextField(db_column='descricao')
    recomendacao = models.TextField(
        blank=True, default='', db_column='recomendacao'
    )
    severidade = models.CharField(
        max_length=6, choices=Severidade.choices, null=True, blank=True,
        db_column='severidade',
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
        db_table = 'Lacuna_Proposta'
        constraints = [
            lista_fixa('lacuna_proposta', 'tipo', TipoLacuna),
            lista_fixa('lacuna_proposta', 'severidade', Severidade),
        ]
        verbose_name_plural = 'lacunas'
        indexes = [
            models.Index(
                fields=['proposta', 'tipo', 'resolvida'],
                name='idx_lacuna_proposta_tipo',
            ),
        ]
