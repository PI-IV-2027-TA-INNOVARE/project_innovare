"""
Casos de uso da administracao de contas.

Quem opera isto e o Administrador: ele provisiona quem *opera a plataforma*.
Quem faz ciencia entra pela rede interna, pelas maos do Supervisor (RN-A04) -
e por isso nao ha aqui nenhum caminho que crie um Pesquisador.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction

from apps.accounts.models import (
    FinalidadeToken,
    Papel,
    SituacaoConta,
    TokenAcesso,
    Usuario,
)
from apps.accounts.services.email import EnviadorDeEmail, EnviadorDjango
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from core.exceptions import ConflitoDeEstado, ErroDeDominio

if TYPE_CHECKING:
    from apps.organizations.models import Organizacao

PAPEIS_PROVISIONAVEIS = (Papel.SUPERVISOR, Papel.ADMINISTRADOR, Papel.DEMANDANTE)


class ProvisionarContaService:
    """
    Cria a conta e envia o convite de primeiro acesso.

    A conta nasce **sem senha utilizavel**: nao ha senha inicial para vazar num
    e-mail, num chat ou num post-it. A pessoa define a dela pelo token.
    """

    def __init__(self, enviador: EnviadorDeEmail | None = None) -> None:
        self._email: EnviadorDeEmail = enviador or EnviadorDjango()

    @transaction.atomic
    def execute(
        self,
        *,
        nome: str,
        email: str,
        papel: str,
        organizacao: Organizacao | None = None,
        ator: Usuario,
    ) -> Usuario:
        if papel not in PAPEIS_PROVISIONAVEIS:
            raise ErroDeDominio(
                'Conta de Pesquisador nasce do cadastro na rede interna, pelo '
                'Supervisor. Use a rede interna, nao esta rota.',
                codigo='papel_nao_provisionavel',
            )

        usuario = Usuario.objects.create_user(
            email=email, nome=nome, papel=papel, organizacao=organizacao,
        )

        token = TokenAcesso.emitir(usuario, FinalidadeToken.CONVITE)
        self._email.convite_acesso(usuario, token)

        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='conta_criada',
            entidade='usuario',
            entidade_id=usuario.id_usuario,
            ator=getattr(ator, 'email', str(ator)),
            detalhe={'papel': usuario.papel, 'email': usuario.email},
        )
        return usuario


class AlterarSituacaoContaService:
    """
    Ativa, inativa ou suspende.

    Caminho unico dessa transicao: a coluna nao e editavel pelo `PATCH`, para
    que nao exista uma segunda porta sem trilha de auditoria.
    """

    def execute(self, *, usuario: Usuario, situacao: str, ator: Usuario) -> Usuario:
        if situacao not in SituacaoConta.values:
            raise ErroDeDominio('Situacao invalida.', codigo='situacao_invalida')

        if usuario.pk == getattr(ator, 'pk', None) and situacao != SituacaoConta.ATIVO:
            raise ErroDeDominio(
                'Voce nao pode inativar ou suspender a propria conta.',
                codigo='autobloqueio',
            )

        anterior = usuario.situacao

        if anterior == situacao:
            return usuario

        usuario.situacao = situacao
        usuario.save(update_fields=['situacao', 'atualizado_em'])

        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='situacao_alterada',
            entidade='usuario',
            entidade_id=usuario.id_usuario,
            ator=getattr(ator, 'email', str(ator)),
            detalhe={'de': anterior, 'para': situacao},
        )
        return usuario


class ReenviarConviteService:
    """Emite um novo convite. O anterior deixa de valer no mesmo instante."""

    def __init__(self, enviador: EnviadorDeEmail | None = None) -> None:
        self._email: EnviadorDeEmail = enviador or EnviadorDjango()

    def execute(self, *, usuario: Usuario, ator: Usuario) -> TokenAcesso:
        if usuario.has_usable_password():
            raise ConflitoDeEstado(
                'Esta conta ja definiu senha. Para trocar a senha, quem usa a '
                'conta pede recuperacao pela tela de login.',
                codigo='senha_ja_definida',
            )

        token = TokenAcesso.emitir(usuario, FinalidadeToken.CONVITE)
        self._email.convite_acesso(usuario, token)

        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='convite_reenviado',
            entidade='usuario',
            entidade_id=usuario.id_usuario,
            ator=getattr(ator, 'email', str(ator)),
        )
        return token
