"""
Contas de acesso do P&D Connect.

Os quatro atores da baseline v1.0 (`CONTEXT.md` secao 3) sao um campo `papel`
nesta tabela. Nao existe rota publica de criacao de conta: ela nasce do
Administrador ou de `liberar-acesso/` na rede interna (RN-A04 / D06).
"""
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.accounts.managers import UsuarioManager
from core.models import ModeloComCarimbo


class Papel(models.TextChoices):
    """Os quatro atores funcionais. RN-A01 / D04: nao existe um quinto."""

    DEMANDANTE = 'demandante', 'Demandante Externo'
    PESQUISADOR = 'pesquisador', 'Pesquisador'
    SUPERVISOR = 'supervisor', 'Supervisor'
    ADMINISTRADOR = 'administrador', 'Administrador'


class SituacaoConta(models.TextChoices):
    """As tres situacoes que a tela Admin - Usuarios e acessos ja apresenta."""

    ATIVO = 'ativo', 'Ativo'
    INATIVO = 'inativo', 'Inativo'
    SUSPENSO = 'suspenso', 'Suspenso'


class Usuario(AbstractBaseUser, PermissionsMixin, ModeloComCarimbo):
    id_usuario = models.BigAutoField(primary_key=True, db_column='id_usuario')
    nome = models.CharField(max_length=160, db_column='nome')
    email = models.EmailField(unique=True, db_column='email')
    password = models.CharField(max_length=128, db_column='senha')
    papel = models.CharField(
        max_length=20,
        choices=Papel.choices,
        db_column='papel',
    )
    situacao = models.CharField(
        max_length=10,
        choices=SituacaoConta.choices,
        default=SituacaoConta.ATIVO,
        db_column='situacao',
    )
    organizacao = models.ForeignKey(
        'organizations.Organizacao',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='usuarios',
        db_column='id_organizacao',
    )
    ultimo_acesso = models.DateTimeField(
        null=True, blank=True, db_column='ultimo_acesso'
    )
    is_staff = models.BooleanField(default=False, db_column='acesso_admin_django')

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['nome', 'papel']

    objects = UsuarioManager()

    class Meta:
        db_table = 'usuario'
        verbose_name = 'usuario'
        verbose_name_plural = 'usuarios'
        indexes = [
            models.Index(fields=['papel', 'situacao'], name='idx_usuario_papel_situacao'),
        ]

    def __str__(self):
        return f'{self.nome} <{self.email}>'

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        return super().save(*args, **kwargs)

    @property
    def is_active(self):
        """
        `is_active` e derivado, nao coluna.

        Uma unica fonte de verdade para "esta conta entra?": `situacao`. Duas
        colunas para a mesma pergunta divergem no primeiro mes - e o caminho
        mais curto para um usuario suspenso que continua logando.
        """
        return self.situacao == SituacaoConta.ATIVO

    @property
    def eh_supervisor(self):
        return self.papel == Papel.SUPERVISOR

    @property
    def eh_administrador(self):
        return self.papel == Papel.ADMINISTRADOR

    def registrar_acesso(self):
        self.ultimo_acesso = timezone.now()
        self.save(update_fields=['ultimo_acesso', 'atualizado_em'])


class FinalidadeToken(models.TextChoices):
    """
    Por que o token existe.

    O plano previa apenas `token_recuperacao_senha`, mas a rota
    `POST /rede/membros/{id}/liberar-acesso/` precisa emitir um token de
    primeiro acesso - mesma mecanica, janela de validade e mensagem diferentes.
    Um discriminador evita uma segunda tabela quase identica.
    """

    RECUPERACAO = 'recuperacao', 'Recuperacao de senha'
    CONVITE = 'convite', 'Primeiro acesso'


class TokenAcesso(models.Model):
    id_token = models.BigAutoField(primary_key=True, db_column='id_token')
    usuario = models.ForeignKey(
        Usuario,
        on_delete=models.CASCADE,
        related_name='tokens_acesso',
        db_column='id_usuario',
    )
    token = models.CharField(max_length=255, unique=True, db_column='token')
    finalidade = models.CharField(
        max_length=12,
        choices=FinalidadeToken.choices,
        default=FinalidadeToken.RECUPERACAO,
        db_column='finalidade',
    )
    expira_em = models.DateTimeField(db_column='expira_em')
    usado_em = models.DateTimeField(null=True, blank=True, db_column='usado_em')
    criado_em = models.DateTimeField(auto_now_add=True, db_column='criado_em')

    class Meta:
        db_table = 'token_acesso'
        indexes = [
            models.Index(fields=['usuario', 'finalidade'], name='idx_token_usuario_final'),
        ]

    def __str__(self):
        return f'{self.finalidade} de {self.usuario_id}'

    @staticmethod
    def gerar_token():
        return secrets.token_urlsafe(32)

    @property
    def valido(self):
        return self.usado_em is None and timezone.now() < self.expira_em

    def consumir(self):
        self.usado_em = timezone.now()
        self.save(update_fields=['usado_em'])

    @classmethod
    def emitir(cls, usuario, finalidade=FinalidadeToken.RECUPERACAO):
        """
        Emite um token e invalida os anteriores da mesma finalidade.

        Invalidar em vez de apagar mantem a trilha: quantos pedidos de
        recuperacao uma conta fez continua sendo uma pergunta respondivel.
        """
        horas = (
            settings.TOKEN_CONVITE_HORAS
            if finalidade == FinalidadeToken.CONVITE
            else settings.TOKEN_RECUPERACAO_HORAS
        )

        cls.objects.filter(
            usuario=usuario, finalidade=finalidade, usado_em__isnull=True
        ).update(usado_em=timezone.now())

        return cls.objects.create(
            usuario=usuario,
            token=cls.gerar_token(),
            finalidade=finalidade,
            expira_em=timezone.now() + timedelta(hours=horas),
        )
