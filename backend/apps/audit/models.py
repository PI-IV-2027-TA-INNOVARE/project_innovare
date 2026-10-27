"""
Trilha de auditoria (RF12) - append-only.

Nunca e atualizada nem apagada pela aplicacao. E a fonte unica da aba Historico
da oportunidade: duas tabelas para a mesma verdade divergem no primeiro mes.

Duas excecoes, ambas de anonimizacao e nunca de remocao do fato: a anonimizacao
pedida pelo titular (LGPD, art. 18) e a retencao programada dos eventos de conta
depois de 12 meses. As duas trocam quem agiu por "pessoa removida", desfazem a
ligacao com a conta e nao mexem no que aconteceu
(`apps/accounts/services/titular.py` e `apps/audit/services/retencao.py`).

Quem agiu fica em dois campos: `ator`, o texto que a tela mostra, e
`conta_do_ator`, a conta. O texto sozinho perde a pessoa quando o e-mail muda.
"""
import uuid

from django.db import models

from core.models import lista_fixa


class CategoriaEvento(models.TextChoices):
    """
    As categorias sao as que a aba Historico do front ja usa.

    `OBSERVACAO` e categoria propria, e nao um tipo dentro de `OPORTUNIDADE`,
    porque o recorte do Demandante e feito por categoria
    (CATEGORIAS_VISIVEIS_AO_DEMANDANTE): a nota que o Supervisor escreve
    enquanto avalia e trabalho interno (PB65 x PB71).
    """

    OPORTUNIDADE = 'oportunidade', 'Oportunidade'
    OBSERVACAO = 'observacao', 'Observação do Supervisor'
    COPILOTO = 'copiloto', 'Copiloto'
    COMPETENCIA = 'competencia', 'Competência'
    MATCHING = 'matching', 'Matching'
    PREANALISE = 'preanalise', 'Pré-análise'
    DECISAO = 'decisao', 'Decisão'
    REDE = 'rede', 'Rede interna'
    CONTA = 'conta', 'Conta e acesso'
    CONFIG = 'config', 'Configuração'


class StatusEvento(models.TextChoices):
    OK = 'ok', 'Concluído'
    ERRO = 'erro', 'Erro'
    NEGADO = 'negado', 'Negado'


class EventoAuditoria(models.Model):
    id_evento = models.BigAutoField(primary_key=True, db_column='id_evento')
    ocorrido_em = models.DateTimeField(db_column='data_hora')
    categoria = models.CharField(
        max_length=16, choices=CategoriaEvento.choices, db_column='categoria'
    )
    tipo = models.CharField(max_length=60, db_column='tipo_evento')
    ator = models.CharField(max_length=160, db_column='ator')
    conta_do_ator = models.ForeignKey(
        'accounts.Usuario',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='eventos_como_ator',
        db_column='id_ator',
    )
    entidade = models.CharField(max_length=60, db_column='entidade')
    entidade_id = models.CharField(max_length=60, db_column='id_entidade')
    status = models.CharField(
        max_length=8,
        choices=StatusEvento.choices,
        default=StatusEvento.OK,
        db_column='status',
    )
    motivo = models.TextField(blank=True, default='', db_column='descricao')
    correlation_id = models.UUIDField(
        default=uuid.uuid4, db_column='id_correlacao'
    )
    execucao_ia = models.ForeignKey(
        'ai.ExecucaoIA',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='eventos',
        db_column='id_execucao_ia',
    )
    oportunidade = models.ForeignKey(
        'opportunities.Oportunidade',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='eventos',
        db_column='id_oportunidade',
    )
    detalhe = models.JSONField(default=dict, db_column='detalhe')
    registrado_em = models.DateTimeField(auto_now_add=True, db_column='registrado_em')

    class Meta:
        db_table = 'Historico_Evento'
        constraints = [
            lista_fixa('historico_evento', 'categoria', CategoriaEvento),
            lista_fixa('historico_evento', 'status', StatusEvento),
        ]
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
            models.Index(
                fields=['entidade_id', '-ocorrido_em'],
                condition=models.Q(tipo='exclusao_solicitada', entidade='usuario'),
                name='idx_evento_pedido_exclusao',
            ),
        ]

    def __str__(self):
        return f'{self.categoria}.{self.tipo} por {self.ator}'
