"""
Notificacoes.

P17 esta aberta: o app existia no backend legado desenhado para o fluxo antigo
de proposta / interesse / aceite, que a baseline v1.2 eliminou. A tabela nasce
aqui ja com o vocabulario novo; se o PO decidir que notificacoes saem do MVP, a
remocao entra no controle de escopo (AGENTS.md 3.2).
"""
from django.db import models


class Notificacao(models.Model):
    id_notificacao = models.BigAutoField(
        primary_key=True, db_column='id_notificacao'
    )
    usuario = models.ForeignKey(
        'accounts.Usuario',
        on_delete=models.CASCADE,
        related_name='notificacoes',
        db_column='id_usuario',
    )
    tipo = models.CharField(max_length=60, db_column='tipo')
    titulo = models.CharField(max_length=200, db_column='titulo')
    mensagem = models.TextField(db_column='mensagem')
    entidade = models.CharField(
        max_length=60, blank=True, default='', db_column='entidade'
    )
    entidade_id = models.CharField(
        max_length=60, blank=True, default='', db_column='entidade_id'
    )
    lida_em = models.DateTimeField(null=True, blank=True, db_column='lida_em')
    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')

    class Meta:
        db_table = 'notificacao'
        verbose_name_plural = 'notificacoes'
        ordering = ['-criado_em']
        indexes = [
            models.Index(
                fields=['usuario', 'lida_em'], name='idx_notif_usuario_lida'
            ),
        ]
