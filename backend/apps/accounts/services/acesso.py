"""
Casos de uso do acesso a conta.

Um caso de uso por classe, com `execute()`. O servico nao conhece `request`,
`Response` nem ORM cru fora do seu proprio agregado (AGENTS.md secao 1).
"""
from __future__ import annotations

from django.db import transaction
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import FinalidadeToken, TokenAcesso, Usuario
from apps.accounts.services.email import EnviadorDeEmail, EnviadorDjango
from apps.audit.models import CategoriaEvento, StatusEvento
from apps.audit.services import registrar_evento
from core.exceptions import ErroDeDominio


class SolicitarRecuperacaoSenhaService:
    """
    Emite um token de recuperacao e envia o e-mail.

    Responde igual exista ou nao a conta: o formulario publico nao pode virar
    um verificador de quais e-mails estao cadastrados.
    """

    def __init__(self, enviador: EnviadorDeEmail | None = None) -> None:
        self._email: EnviadorDeEmail = enviador or EnviadorDjango()

    def execute(self, email: str) -> TokenAcesso | None:
        email = (email or '').strip().lower()
        usuario = Usuario.objects.filter(email=email).first()

        if usuario is None:
            registrar_evento(
                categoria=CategoriaEvento.CONTA,
                tipo='recuperacao_solicitada',
                entidade='usuario',
                entidade_id='desconhecido',
                ator=email,
                status=StatusEvento.NEGADO,
                motivo='E-mail sem conta correspondente.',
            )
            return None

        token = TokenAcesso.emitir(usuario, FinalidadeToken.RECUPERACAO)
        self._email.recuperacao_senha(usuario, token)

        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='recuperacao_solicitada',
            entidade='usuario',
            entidade_id=usuario.id_usuario,
            ator=usuario.email,
        )
        return token


class RedefinirSenhaService:
    """Consome um token (recuperacao ou convite) e grava a nova senha."""

    def execute(self, token_str: str, nova_senha: str) -> Usuario:
        token = TokenAcesso.objects.select_related('usuario').filter(
            token=token_str
        ).first()

        if token is None:
            raise ErroDeDominio('Token invalido.', codigo='token_invalido')

        if not token.valido:
            raise ErroDeDominio(
                'Token expirado ou ja utilizado. Solicite um novo link.',
                codigo='token_expirado',
            )

        usuario = token.usuario

        with transaction.atomic():
            usuario.set_password(nova_senha)
            usuario.save(update_fields=['password', 'atualizado_em'])
            token.consumir()

        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo=(
                'primeiro_acesso_concluido'
                if token.finalidade == FinalidadeToken.CONVITE
                else 'senha_redefinida'
            ),
            entidade='usuario',
            entidade_id=usuario.id_usuario,
            ator=usuario.email,
        )
        return usuario


class AlterarSenhaService:
    """Troca de senha com a sessao ativa. A senha atual ja foi conferida no serializer."""

    def execute(self, usuario: Usuario, nova_senha: str) -> Usuario:
        usuario.set_password(nova_senha)
        usuario.save(update_fields=['password', 'atualizado_em'])

        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='senha_alterada',
            entidade='usuario',
            entidade_id=usuario.id_usuario,
            ator=usuario.email,
        )
        return usuario


class RegistrarAcessoService:
    """Carimba `ultimo_acesso` e deixa o login na trilha."""

    def execute(self, usuario: Usuario) -> Usuario:
        usuario.registrar_acesso()

        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='login',
            entidade='usuario',
            entidade_id=usuario.id_usuario,
            ator=usuario.email,
            detalhe={'papel': usuario.papel},
        )
        return usuario


class EncerrarSessaoService:
    """
    Poe o refresh na blacklist (PB02).

    O criterio de aceite exige que, encerrada a sessao, uma pagina protegida
    peca nova autenticacao. Sem isto, `logout` so apaga o token do navegador e
    quem tiver copiado o refresh segue renovando o acesso ate ele expirar.
    """

    def execute(self, *, refresh: str, usuario: Usuario) -> None:
        try:
            token = RefreshToken(refresh)
        except TokenError as exc:
            raise ErroDeDominio(
                'Sessao invalida ou ja encerrada.', codigo='refresh_invalido'
            ) from exc

        if str(token.get(api_settings.USER_ID_CLAIM)) != str(usuario.pk):
            registrar_evento(
                categoria=CategoriaEvento.CONTA,
                tipo='logout',
                entidade='usuario',
                entidade_id=usuario.id_usuario,
                ator=usuario.email,
                status=StatusEvento.NEGADO,
                motivo='refresh de outra conta',
            )
            raise ErroDeDominio(
                'Sessao invalida ou ja encerrada.', codigo='refresh_invalido'
            )

        try:
            token.blacklist()
        except AttributeError as exc:
            raise ErroDeDominio(
                'Blacklist de token nao esta habilitada.', codigo='blacklist_desligada'
            ) from exc

        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='logout',
            entidade='usuario',
            entidade_id=usuario.id_usuario,
            ator=usuario.email,
        )
