"""
Casos de uso da rede interna (RF02, RF03, RN-A04 / D06).

Um caso de uso por classe, com `execute()`. A view recebe, delega e responde.
"""
from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.accounts.models import FinalidadeToken, Papel, SituacaoConta, TokenAcesso, Usuario
from apps.accounts.services.email import EnviadorDeEmail, EnviadorDjango
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.network.models import (
    Competencia,
    DeclaradoPor,
    MembroCompetencia,
    MembroRede,
    PapelNaRede,
    SituacaoMembro,
    TipoCompetencia,
)
from core.exceptions import ConflitoDeEstado, ErroDeDominio

LISTAS = {
    'competencias': TipoCompetencia.COMPETENCIA,
    'tecnicas': TipoCompetencia.TECNICA,
    'linhas': TipoCompetencia.LINHA_PESQUISA,
}

PAPEL_REDE_PARA_ACESSO = {
    PapelNaRede.SUPERVISOR: Papel.SUPERVISOR,
    PapelNaRede.PESQUISADOR: Papel.PESQUISADOR,
    PapelNaRede.COLABORADOR: Papel.PESQUISADOR,
    PapelNaRede.GRADUANDO: Papel.PESQUISADOR,
}


def sincronizar_competencias(
    membro: MembroRede, listas: dict[str, list[str]]
) -> None:
    """
    Troca os vinculos do membro pelos nomes recebidos.

    O vocabulario e aberto por ora (P11): nome novo vira `Competencia` nova, do
    tipo da lista em que foi digitado. Quando P11 fechar num vocabulario
    controlado, e aqui que a validacao entra - a tela nao muda.
    """
    for campo, tipo in LISTAS.items():
        if campo not in listas:
            continue

        nomes = [n.strip() for n in listas[campo] if n and n.strip()]

        membro.vinculos_competencia.filter(competencia__tipo=tipo).delete()

        for nome in dict.fromkeys(nomes):
            competencia, _ = Competencia.objects.get_or_create(
                nome=nome, tipo=tipo
            )
            MembroCompetencia.objects.get_or_create(
                membro=membro,
                competencia=competencia,
                defaults={'declarado_por': DeclaradoPor.SUPERVISOR},
            )


class CadastrarMembroService:
    """
    O Supervisor poe a pessoa na rede (RF02).

    O cadastro nao cria conta: `situacao` nasce `sem_acesso` e `usuario` nulo.
    Liberar o acesso e o passo seguinte, e separado (RN-A04).
    """

    @transaction.atomic
    def execute(
        self, *, dados: dict[str, Any], listas: dict[str, list[str]], ator: Usuario
    ) -> MembroRede:
        email = dados['email'].strip().lower()

        if MembroRede.objects.filter(email=email).exists():
            raise ConflitoDeEstado(
                'Ja existe alguem na rede com este e-mail.',
                codigo='email_duplicado',
            )

        membro = MembroRede.objects.create(
            **{**dados, 'email': email},
            situacao=SituacaoMembro.SEM_ACESSO,
            cadastrado_por=ator if isinstance(ator, Usuario) else None,
        )

        sincronizar_competencias(membro, listas)

        registrar_evento(
            categoria=CategoriaEvento.REDE,
            tipo='membro_cadastrado',
            entidade='membro_rede',
            entidade_id=membro.id_membro,
            ator=getattr(ator, 'email', str(ator)),
            detalhe={'papel_rede': membro.papel_rede, 'email': membro.email},
        )
        return membro


class AtualizarMembroService:
    """Edicao do cadastro pelo Supervisor (PB16)."""

    @transaction.atomic
    def execute(
        self,
        *,
        membro: MembroRede,
        dados: dict[str, Any],
        listas: dict[str, list[str]],
        ator: Usuario,
    ) -> MembroRede:
        antes = {campo: getattr(membro, campo) for campo in dados}

        for campo, valor in dados.items():
            setattr(membro, campo, valor)

        membro.save()
        sincronizar_competencias(membro, listas)

        mudou = {
            campo: {'de': str(antes[campo]), 'para': str(getattr(membro, campo))}
            for campo in dados
            if str(antes[campo]) != str(getattr(membro, campo))
        }

        registrar_evento(
            categoria=CategoriaEvento.REDE,
            tipo='membro_atualizado',
            entidade='membro_rede',
            entidade_id=membro.id_membro,
            ator=getattr(ator, 'email', str(ator)),
            detalhe={'campos': mudou},
        )
        return membro


class LiberarAcessoMembroService:
    """
    Da login a quem ja esta na rede (PB08 / RN-A04).

    A conta nasce sem senha utilizavel e a pessoa define a dela pelo convite -
    mesma mecanica do provisionamento feito pelo Administrador.
    """

    def __init__(self, enviador: EnviadorDeEmail | None = None) -> None:
        self._email: EnviadorDeEmail = enviador or EnviadorDjango()

    @transaction.atomic
    def execute(self, *, membro: MembroRede, ator: Usuario) -> MembroRede:
        if membro.usuario_id:
            raise ConflitoDeEstado(
                'Esta pessoa ja tem acesso a plataforma.',
                codigo='acesso_ja_liberado',
            )

        if Usuario.objects.filter(email=membro.email).exists():
            raise ConflitoDeEstado(
                'Ja existe uma conta com este e-mail.',
                codigo='email_em_uso',
            )

        papel = PAPEL_REDE_PARA_ACESSO.get(membro.papel_rede)

        if papel is None:
            raise ErroDeDominio(
                'Papel na rede sem equivalente de acesso.',
                codigo='papel_sem_acesso',
            )

        usuario = Usuario.objects.create_user(
            email=membro.email,
            nome=membro.nome,
            papel=papel,
            organizacao=membro.organizacao,
        )
        usuario.situacao = SituacaoConta.ATIVO
        usuario.save(update_fields=['situacao'])

        membro.usuario = usuario
        membro.situacao = SituacaoMembro.ATIVO
        membro.save(update_fields=['usuario', 'situacao', 'atualizado_em'])

        token = TokenAcesso.emitir(usuario, FinalidadeToken.CONVITE)
        self._email.convite_acesso(usuario, token)

        registrar_evento(
            categoria=CategoriaEvento.REDE,
            tipo='acesso_liberado',
            entidade='membro_rede',
            entidade_id=membro.id_membro,
            ator=getattr(ator, 'email', str(ator)),
            detalhe={'papel': papel, 'email': membro.email},
        )
        return membro


class AtualizarPerfilProprioService:
    """
    RN-A05: o Pesquisador mantem o proprio perfil.

    O serializer ja barra os campos de cadastro; aqui o evento registra que foi
    o proprio membro quem declarou, o que muda o peso da competencia no
    matching (`declarado_por`).
    """

    @transaction.atomic
    def execute(
        self,
        *,
        membro: MembroRede,
        dados: dict[str, Any],
        listas: dict[str, list[str]],
        ator: Usuario,
    ) -> MembroRede:
        for campo, valor in dados.items():
            setattr(membro, campo, valor)

        membro.save()
        sincronizar_competencias(membro, listas)

        membro.vinculos_competencia.update(declarado_por=DeclaradoPor.MEMBRO)

        registrar_evento(
            categoria=CategoriaEvento.REDE,
            tipo='perfil_atualizado',
            entidade='membro_rede',
            entidade_id=membro.id_membro,
            ator=getattr(ator, 'email', str(ator)),
            detalhe={'campos': sorted(dados.keys()) + sorted(listas.keys())},
        )
        return membro
