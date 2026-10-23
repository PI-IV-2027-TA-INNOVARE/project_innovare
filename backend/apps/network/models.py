"""
Rede interna da AC2 e perfil profissional (RF02, RF03).

O matching opera *somente* sobre esta rede (`CONTEXT.md` secao 4). Nao ha busca
externa em Lattes, ResearchGate ou Scholar (secao 7, OUT OF SCOPE).
"""
from django.db import models
from django.db.models.functions import Coalesce

from core.models import ModeloComCarimbo, lista_fixa


class PapelNaRede(models.TextChoices):
    """
    Distinto do papel de acesso: o membro da rede pode nao ter conta.

    RN-A01 fecha os atores em Demandante Externo, Pesquisador, Supervisor e
    Administrador; so os dois ultimos integram a rede interna.
    """

    SUPERVISOR = 'supervisor', 'Supervisor'
    PESQUISADOR = 'pesquisador', 'Pesquisador'


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
        db_table = 'Titulacao'
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
        max_length=16, choices=TipoCompetencia.choices, db_column='categoria'
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
        db_table = 'Competencia'
        verbose_name_plural = 'competencias'
        constraints = [
            lista_fixa('competencia', 'tipo', TipoCompetencia, coluna='categoria'),
            models.UniqueConstraint(
                fields=['nome', 'tipo'], name='uq_competencia_nome_categoria'
            ),
        ]

    def __str__(self):
        return f'{self.nome} ({self.get_tipo_display()})'


class MembroRedeQuerySet(models.QuerySet):
    def com_email(self, email):
        """Quem usa este e-mail, more ele no membro ou na conta ligada."""
        return self.filter(
            models.Q(email_sem_conta=email) | models.Q(usuario__email=email)
        )

    def com_identificacao(self):
        """
        `nome_atual` e `email_atual` para filtrar e ordenar no banco.

        Com conta, nome e e-mail moram nela; sem conta, no membro. O
        `Coalesce` le os dois lugares, e o CHECK garante que so um esta
        preenchido.
        """
        return self.select_related('usuario').annotate(
            nome_atual=Coalesce('usuario__nome', 'nome_sem_conta'),
            email_atual=Coalesce('usuario__email', 'email_sem_conta'),
        )


class MembroRede(ModeloComCarimbo):
    """
    A pessoa da rede da AC2.

    Existe *antes* da conta: o Supervisor cadastra e so depois libera o acesso
    (RN-A04). `usuario` nulo e exatamente a situacao `sem_acesso`.

    Nome e e-mail ficam aqui so enquanto nao ha conta. Liberado o acesso, eles
    passam a morar em `Usuario` e as colunas daqui ficam nulas - copiados nos
    dois lugares, dependiam de sincronizacao a mao e podiam divergir (3FN).
    """

    id_membro = models.BigAutoField(primary_key=True, db_column='id_membro')
    usuario = models.OneToOneField(
        'accounts.Usuario',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='membro_rede',
        db_column='id_usuario',
    )
    nome_sem_conta = models.CharField(
        max_length=160, null=True, blank=True, db_column='nome'
    )
    email_sem_conta = models.EmailField(
        unique=True, null=True, blank=True, db_column='email'
    )
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
    experiencia = models.TextField(
        blank=True, default='', db_column='experiencia_profissional'
    )
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
        db_column='id_cadastrado_por',
    )
    competencias = models.ManyToManyField(
        Competencia,
        through='MembroCompetencia',
        related_name='membros',
    )

    objects = MembroRedeQuerySet.as_manager()

    class Meta:
        db_table = 'Membro_Rede'
        constraints = [
            lista_fixa('membro_rede', 'papel_rede', PapelNaRede),
            lista_fixa('membro_rede', 'disponibilidade', Disponibilidade),
            lista_fixa('membro_rede', 'situacao', SituacaoMembro),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        usuario__isnull=True,
                        nome_sem_conta__isnull=False,
                        email_sem_conta__isnull=False,
                    )
                    | models.Q(
                        usuario__isnull=False,
                        nome_sem_conta__isnull=True,
                        email_sem_conta__isnull=True,
                    )
                ),
                name='ck_membro_rede_nome_email_sem_conta',
            ),
        ]
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

    @property
    def nome(self):
        return self.usuario.nome if self.usuario_id else self.nome_sem_conta

    @property
    def email(self):
        return self.usuario.email if self.usuario_id else self.email_sem_conta

    def ligar_a_conta(self, usuario):
        """Nome e e-mail passam a morar na conta; aqui ficam nulos."""
        self.usuario = usuario
        self.nome_sem_conta = None
        self.email_sem_conta = None

    def save(self, *args, **kwargs):
        if self.email_sem_conta:
            self.email_sem_conta = self.email_sem_conta.strip().lower()
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
        null=True, blank=True, db_column='nivel_dominio'
    )
    declarado_por = models.CharField(
        max_length=12,
        choices=DeclaradoPor.choices,
        default=DeclaradoPor.SUPERVISOR,
        db_column='declarado_por',
    )
    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')

    class Meta:
        db_table = 'Competencia_Perfil'
        constraints = [
            lista_fixa('competencia_perfil', 'declarado_por', DeclaradoPor),
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
        db_table = 'Formacao'
        verbose_name_plural = 'formacoes'
        ordering = ['-ano_conclusao']
