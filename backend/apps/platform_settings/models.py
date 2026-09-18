"""Configuracao administravel da plataforma: tema, suporte, parametros."""
from django.db import models


class ConfiguracaoPlataforma(models.Model):
    """
    Documento de configuracao por secao, gravado por JSON Merge Patch.

    O payload e guardado *cru*, sem defaults aplicados: com defaults dentro, um
    token que o backend nunca gravou produz diff vazio e a gravacao se perde.
    """

    id_configuracao = models.BigAutoField(
        primary_key=True, db_column='id_configuracao'
    )
    secao = models.CharField(max_length=40, unique=True, db_column='secao')
    payload = models.JSONField(default=dict, db_column='payload')
    revisao = models.PositiveIntegerField(default=0, db_column='revisao')
    atualizado_por = models.ForeignKey(
        'accounts.Usuario',
        null=True,
        on_delete=models.SET_NULL,
        related_name='configuracoes_atualizadas',
        db_column='atualizado_por',
    )
    atualizado_em = models.DateTimeField(auto_now=True, db_column='atualizado_em')

    class Meta:
        db_table = 'configuracao_plataforma'
        verbose_name = 'configuracao da plataforma'
        verbose_name_plural = 'configuracoes da plataforma'

    def __str__(self):
        return f'{self.secao} (rev {self.revisao})'


class ContatoSuporte(models.Model):
    """Alimenta a tela `/sem-acesso`, hoje servida por uma lista fixa no front."""

    id_contato = models.BigAutoField(primary_key=True, db_column='id_contato')
    nome = models.CharField(max_length=160, db_column='nome')
    papel = models.CharField(max_length=120, db_column='papel')
    email = models.EmailField(db_column='email')
    telefone = models.CharField(
        max_length=40, null=True, blank=True, db_column='telefone'
    )
    ordem = models.PositiveSmallIntegerField(default=0, db_column='ordem')
    ativo = models.BooleanField(default=True, db_column='ativo')

    class Meta:
        db_table = 'contato_suporte'
        ordering = ['ordem', 'nome']

    def __str__(self):
        return self.nome
