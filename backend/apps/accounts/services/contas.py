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
from apps.network.models import MembroRede, PapelNaRede, SituacaoMembro
from core.exceptions import ConflitoDeEstado, ErroDeDominio

if TYPE_CHECKING:
    from apps.organizations.models import Organizacao

PAPEIS_PROVISIONAVEIS = (Papel.SUPERVISOR, Papel.ADMINISTRADOR, Papel.DEMANDANTE)


def _criar_membro_rede_para_supervisor(
    *,
    usuario: Usuario,
    organizacao: Organizacao | None,
    ator: Usuario,
) -> MembroRede | None:
    """Cria MembroRede correspondente quando um SUPERVISOR e provisionado."""
    if usuario.papel != Papel.SUPERVISOR:
        return None

    if MembroRede.objects.com_email(usuario.email).exists():
        return None

    membro = MembroRede.objects.create(
        usuario=usuario,
        papel_rede=PapelNaRede.SUPERVISOR,
        organizacao=organizacao,
        experiencia='',
        situacao=SituacaoMembro.ATIVO,
        cadastrado_por=ator,
    )

    registrar_evento(
        categoria=CategoriaEvento.REDE,
        tipo='membro_cadastrado',
        entidade='membro_rede',
        entidade_id=membro.id_membro,
        ator=getattr(ator, 'email', str(ator)),
        detalhe={'papel_rede': membro.papel_rede, 'email': membro.email, 'origem': 'provisionamento_admin'},
    )
    return membro


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

        _criar_membro_rede_para_supervisor(
            usuario=usuario, organizacao=organizacao, ator=ator,
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


def garantir_email_livre(
    email: str, *, usuario: Usuario | None = None, membro: MembroRede | None = None
) -> None:
    """
    Recusa o e-mail que ja pertence a outra pessoa - conta ou membro da rede.

    O membro sem conta guarda o proprio e-mail, porque nasce antes da conta
    (RN-A04); com conta, o e-mail e o da conta. A unicidade de cada tabela
    sozinha nao basta: o e-mail livre em `Usuario` pode estar em uso por um
    membro ainda sem acesso, e liberar o acesso dele quebraria depois.
    """
    contas = Usuario.objects.filter(email=email)
    membros = MembroRede.objects.filter(email_sem_conta=email)

    if usuario is not None:
        contas = contas.exclude(pk=usuario.pk)
    if membro is not None:
        membros = membros.exclude(pk=membro.pk)

    if contas.exists() or membros.exists():
        raise ConflitoDeEstado(
            'Este e-mail ja pertence a outra pessoa na plataforma.',
            codigo='email_em_uso',
        )


class AtualizarContaService:
    """
    Edicao da conta pelo Administrador.

    Se a conta tem membro na rede, nome e e-mail sao os dela: o membro nao
    guarda copia, entao nao ha o que propagar. Situacao nao passa por aqui -
    tem rota propria, que audita a transicao.
    """

    @transaction.atomic
    def execute(self, *, usuario: Usuario, dados: dict, ator: Usuario) -> Usuario:
        membro = MembroRede.objects.filter(usuario=usuario).first()

        if 'email' in dados and dados['email'] != usuario.email:
            garantir_email_livre(dados['email'], usuario=usuario, membro=membro)

        mudou = sorted(
            campo for campo, valor in dados.items() if getattr(usuario, campo) != valor
        )

        if not mudou:
            return usuario

        for campo, valor in dados.items():
            setattr(usuario, campo, valor)
        usuario.save()

        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='conta_atualizada',
            entidade='usuario',
            entidade_id=usuario.id_usuario,
            ator=getattr(ator, 'email', str(ator)),
            detalhe={'campos': mudou},
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
