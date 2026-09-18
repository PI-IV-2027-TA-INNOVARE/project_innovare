"""
Oportunidade - o registro central do sistema (RF01).

Substitui a `pesquisa` do modelo antigo, que era um projeto publicado por
empresa com orcamento e prazo, e nao a Oportunidade da baseline v1.2.
"""
from django.db import models, transaction

from core.models import ModeloComCarimbo


class OrigemOportunidade(models.TextChoices):
    """As duas portas de entrada do produto (D05)."""

    EXTERNO = 'externo', 'Problema externo'
    INTERNA = 'interna', 'Ideia interna'


class SituacaoOportunidade(models.TextChoices):
    """
    Espelho do fluxo de valor (`CONTEXT.md` secao 5), nao uma maquina de
    estados aprovada: quais transicoes valem e quem as dispara e P13.
    """

    ENTRADA = 'entrada', 'Entrada'
    ESTRUTURACAO = 'estruturacao', 'Em estruturacao'
    COMPETENCIAS = 'competencias', 'Competencias'
    MATCHING = 'matching', 'Matching'
    PRE_ANALISE = 'pre_analise', 'Pre-analise'
    AGUARDANDO_DECISAO = 'aguardando_decisao', 'Aguardando decisao'
    CONTINUAR = 'continuar', 'Continuar'
    REVISAR = 'revisar', 'Revisar'
    ARQUIVADA = 'arquivada', 'Arquivada'



CATEGORIAS_VISIVEIS_AO_DEMANDANTE = ("oportunidade", "decisao")
"""
O recorte que PB71 define: o Demandante acompanha o andamento "sem acessar
informacoes internas restritas (ex.: resultados de matching, pre-analise
detalhada)". Copiloto, competencia, matching e pre-analise ficam de fora.
"""

class SequenciaCodigo(models.Model):
    """
    Contador anual do codigo `OP-2026-014`.

    `max(codigo) + 1` disputa: dois cadastros simultaneos leem o mesmo maximo e
    o segundo estoura o `unique`. Uma linha por ano, travada com
    `select_for_update`, e a forma barata de nao ter esse bug em producao - e o
    codigo e o que a URL do front usa, entao ele nao pode nascer duplicado.
    """

    id_sequencia = models.BigAutoField(primary_key=True, db_column='id_sequencia')
    ano = models.PositiveSmallIntegerField(unique=True, db_column='ano')
    ultimo_numero = models.PositiveIntegerField(default=0, db_column='ultimo_numero')

    class Meta:
        db_table = 'sequencia_codigo'
        verbose_name = 'sequencia de codigo'
        verbose_name_plural = 'sequencias de codigo'

    @classmethod
    def proximo_codigo(cls, ano):
        with transaction.atomic():
            sequencia, _ = cls.objects.select_for_update().get_or_create(ano=ano)
            sequencia.ultimo_numero += 1
            sequencia.save(update_fields=['ultimo_numero'])
            return f'OP-{ano}-{sequencia.ultimo_numero:03d}'


class Oportunidade(models.Model):
    id_oportunidade = models.BigAutoField(
        primary_key=True, db_column='id_oportunidade'
    )
    codigo = models.CharField(max_length=14, unique=True, db_column='codigo')
    titulo = models.CharField(max_length=200, db_column='titulo')
    origem = models.CharField(
        max_length=8, choices=OrigemOportunidade.choices, db_column='origem'
    )
    resumo = models.TextField(blank=True, default='', db_column='resumo')
    contexto = models.TextField(blank=True, default='', db_column='contexto')
    demandante = models.ForeignKey(
        'organizations.Organizacao',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='oportunidades',
        db_column='id_demandante',
    )
    criado_por = models.ForeignKey(
        'accounts.Usuario',
        null=True,
        on_delete=models.SET_NULL,
        related_name='oportunidades_criadas',
        db_column='id_criado_por',
    )
    responsavel = models.ForeignKey(
        'network.MembroRede',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='oportunidades_conduzidas',
        db_column='id_responsavel',
    )
    situacao = models.CharField(
        max_length=20,
        choices=SituacaoOportunidade.choices,
        default=SituacaoOportunidade.ENTRADA,
        db_column='situacao',
    )
    criada_em = models.DateTimeField(auto_now_add=True, db_column='criada_em')
    atualizada_em = models.DateTimeField(auto_now=True, db_column='atualizada_em')

    class Meta:
        db_table = 'oportunidade'
        verbose_name_plural = 'oportunidades'
        ordering = ['-atualizada_em']
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(origem='interna', demandante__isnull=True)
                    | models.Q(origem='externo', demandante__isnull=False)
                ),
                name='ck_oportunidade_origem_demandante',
            ),
        ]
        indexes = [
            models.Index(
                fields=['situacao', '-atualizada_em'],
                name='idx_oport_fila_supervisor',
            ),
        ]

    def __str__(self):
        return f'{self.codigo} - {self.titulo}'


class AnexoOportunidade(models.Model):
    """Documentos de apoio. Politica de tipos, tamanho e retencao e P14."""

    id_anexo = models.BigAutoField(primary_key=True, db_column='id_anexo')
    oportunidade = models.ForeignKey(
        Oportunidade,
        on_delete=models.CASCADE,
        related_name='anexos',
        db_column='id_oportunidade',
    )
    arquivo = models.FileField(upload_to='anexos/%Y/%m/', db_column='arquivo')
    nome_original = models.CharField(max_length=255, db_column='nome_original')
    mime = models.CharField(max_length=120, db_column='mime')
    tamanho_bytes = models.BigIntegerField(db_column='tamanho_bytes')
    enviado_por = models.ForeignKey(
        'accounts.Usuario',
        null=True,
        on_delete=models.SET_NULL,
        related_name='anexos_enviados',
        db_column='enviado_por',
    )
    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')

    class Meta:
        db_table = 'anexo_oportunidade'
        verbose_name = 'anexo da oportunidade'
        verbose_name_plural = 'anexos da oportunidade'

    def __str__(self):
        return self.nome_original
