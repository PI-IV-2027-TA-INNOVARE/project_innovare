"""
Rede interna da AC2 e perfil profissional (RF02, RF03).

O matching opera *somente* sobre esta rede (`CONTEXT.md` secao 4). Nao ha busca
externa em Lattes, ResearchGate ou Scholar (secao 7, OUT OF SCOPE).
"""
from django.db import models

from core.models import ModeloComCarimbo


class PapelNaRede(models.TextChoices):
    """Distinto do papel de acesso: um colaborador pode nao ter conta."""

    SUPERVISOR = 'supervisor', 'Supervisor'
    PESQUISADOR = 'pesquisador', 'Pesquisador'
    COLABORADOR = 'colaborador', 'Colaborador'
    GRADUANDO = 'graduando', 'Graduando / bolsista'


class Disponibilidade(models.TextChoices):
    """
    O que torna a sugestao do matching realista: competencia sem
    disponibilidade produz equipe potencial que nao se sustenta na pratica.
    """

    INTEGRAL = 'integral', 'Integral'
    PARCIAL = 'parcial', 'Parcial'
    PONTUAL = 'pontual', 'Pontual / consultiva'
    INDISPONIVEL = 'indisponivel', 'Indisponivel no momento'


class SituacaoMembro(models.TextChoices):
    ATIVO = 'ativo', 'Ativo'
    SEM_ACESSO = 'sem_acesso', 'Sem acesso'
    INATIVO = 'inativo', 'Inativo'


class TipoCompetencia(models.TextChoices):
    COMPETENCIA = 'competencia', 'Competencia'
    TECNICA = 'tecnica', 'Tecnica'
    LINHA_PESQUISA = 'linha_pesquisa', 'Linha de pesquisa'


class DeclaradoPor(models.TextChoices):
    MEMBRO = 'membro', 'O proprio membro'
    SUPERVISOR = 'supervisor', 'Supervisor'


class Titulacao(models.Model):
    """
    Vocabulario controlado com nivel comparavel.

    RF07 filtra "especialmente mestres e doutores" - isso nao e filtravel sobre
    string digitada a mao. Pendencia P12 confirma a lista fechada com o PO.
    """

    id_titulacao = models.BigAutoField(primary_key=True, db_column='id_titulacao')
    codigo = models.CharField(max_length=40, unique=True, db_column='codigo')
    rotulo = models.CharField(max_length=80, db_column='rotulo')
    nivel = models.PositiveSmallIntegerField(db_column='nivel')

    class Meta:
        db_table = 'titulacao'
        ordering = ['nivel']

    def __str__(self):
        return self.rotulo


class Competencia(ModeloComCarimbo):
    """
    Vocabulario unico para as tres listas que a UI mostra separadas
    (competencias, tecnicas, linhas de pesquisa). Um discriminador evita tres
    tabelas quase identicas - e um unico indice vetorial servira as tres.
    """

    id_competencia = models.BigAutoField(primary_key=True, db_column='id_competencia')
    nome = models.CharField(max_length=160, db_column='nome')
    tipo = models.CharField(
        max_length=16, choices=TipoCompetencia.choices, db_column='tipo'
    )
    canonica = models.BooleanField(default=False, db_column='canonica')
    sinonimo_de = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='sinonimos',
        db_column='id_sinonimo_de',
    )
    ativo = models.BooleanField(default=True, db_column='ativo')

    class Meta:
        db_table = 'competencia'
        verbose_name_plural = 'competencias'
        constraints = [
            models.UniqueConstraint(
                fields=['nome', 'tipo'], name='uq_competencia_nome_tipo'
            ),
        ]

    def __str__(self):
        return f'{self.nome} ({self.get_tipo_display()})'


class MembroRede(ModeloComCarimbo):
    """
    A pessoa da rede da AC2.

    Existe *antes* da conta: o Supervisor cadastra e so depois libera o acesso
    (RN-A04). `usuario` nulo e exatamente a situacao `sem_acesso`.
    """

    id_membro = models.BigAutoField(primary_key=True, db_column='id_membro')
    usuario = models.OneToOneField(
        'accounts.Usuario',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='membro_rede',
        db_column='id_usuario',
    )
    nome = models.CharField(max_length=160, db_column='nome')
    email = models.EmailField(unique=True, db_column='email')
    papel_rede = models.CharField(
        max_length=16, choices=PapelNaRede.choices, db_column='papel_rede'
    )
    titulacao = models.ForeignKey(
        Titulacao,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='membros',
        db_column='id_titulacao',
    )
    organizacao = models.ForeignKey(
        'organizations.Organizacao',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='membros_rede',
        db_column='id_organizacao',
    )
    disponibilidade = models.CharField(
        max_length=14,
        choices=Disponibilidade.choices,
        default=Disponibilidade.PARCIAL,
        db_column='disponibilidade',
    )
    experiencia = models.TextField(blank=True, default='', db_column='experiencia')
    situacao = models.CharField(
        max_length=12,
        choices=SituacaoMembro.choices,
        default=SituacaoMembro.SEM_ACESSO,
        db_column='situacao',
    )
    cadastrado_por = models.ForeignKey(
        'accounts.Usuario',
        null=True,
        on_delete=models.SET_NULL,
        related_name='membros_cadastrados',
        db_column='cadastrado_por',
    )
    competencias = models.ManyToManyField(
        Competencia,
        through='MembroCompetencia',
        related_name='membros',
    )

    class Meta:
        db_table = 'membro_rede'
        verbose_name = 'membro da rede'
        verbose_name_plural = 'membros da rede'
        indexes = [
            models.Index(
                fields=['situacao', 'disponibilidade'],
                name='idx_membro_situacao_disp',
            ),
        ]

    def __str__(self):
        return self.nome

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        return super().save(*args, **kwargs)


class MembroCompetencia(models.Model):
    """Juncao. O `tipo` (competencia / tecnica / linha) vem da competencia."""

    id_membro_competencia = models.BigAutoField(
        primary_key=True, db_column='id_membro_competencia'
    )
    membro = models.ForeignKey(
        MembroRede,
        on_delete=models.CASCADE,
        related_name='vinculos_competencia',
        db_column='id_membro',
    )
    competencia = models.ForeignKey(
        Competencia,
        on_delete=models.PROTECT,
        related_name='vinculos_membro',
        db_column='id_competencia',
    )
    nivel = models.PositiveSmallIntegerField(
        null=True, blank=True, db_column='nivel'
    )
    declarado_por = models.CharField(
        max_length=12,
        choices=DeclaradoPor.choices,
        default=DeclaradoPor.SUPERVISOR,
        db_column='declarado_por',
    )
    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')

    class Meta:
        db_table = 'membro_competencia'
        constraints = [
            models.UniqueConstraint(
                fields=['membro', 'competencia'],
                name='uq_membro_competencia',
            ),
        ]


class Formacao(ModeloComCarimbo):
    """
    Detalhe academico por registro.

    RF03 nomeia *formacao* como dimensao do perfil, ao lado de titulacao. O
    formulario atual da rede colapsou as duas; manter a tabela preserva o RF03
    sem custo para quem so preenche a titulacao.
    """

    id_formacao = models.BigAutoField(primary_key=True, db_column='id_formacao')
    membro = models.ForeignKey(
        MembroRede,
        on_delete=models.CASCADE,
        related_name='formacoes',
        db_column='id_membro',
    )
    curso = models.CharField(max_length=180, db_column='curso')
    instituicao = models.CharField(max_length=180, db_column='instituicao')
    titulacao = models.ForeignKey(
        Titulacao,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='formacoes',
        db_column='id_titulacao',
    )
    ano_conclusao = models.PositiveSmallIntegerField(
        null=True, blank=True, db_column='ano_conclusao'
    )

    class Meta:
        db_table = 'formacao'
        verbose_name_plural = 'formacoes'
        ordering = ['-ano_conclusao']
