"""
Casos de uso da rede interna (RF02, RF03, RN-A04 / D06).

Um caso de uso por classe, com `execute()`. A view recebe, delega e responde.
"""
from __future__ import annotations

import logging
from typing import Any

from django.db import transaction

from apps.accounts.models import FinalidadeToken, Papel, SituacaoConta, TokenAcesso, Usuario
from apps.accounts.services.contas import garantir_email_livre
from apps.accounts.services.email import EnviadorDeEmail, EnviadorDjango
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.network.models import (
    Competencia,
    DeclaradoPor,
    Formacao,
    MembroCompetencia,
    MembroRede,
    PapelNaRede,
    SituacaoMembro,
    TipoCompetencia,
)
from core.exceptions import ConflitoDeEstado, ErroDeDominio, ServicoIndisponivel

logger = logging.getLogger(__name__)

LISTAS = {
    'competencias': TipoCompetencia.COMPETENCIA,
    'tecnicas': TipoCompetencia.TECNICA,
    'linhas': TipoCompetencia.LINHA_PESQUISA,
}

PAPEL_REDE_PARA_ACESSO = {
    PapelNaRede.SUPERVISOR: Papel.SUPERVISOR,
    PapelNaRede.PESQUISADOR: Papel.PESQUISADOR,
}


def sincronizar_competencias(
    membro: MembroRede, listas: dict[str, list[str]]
) -> None:
    """
    Troca os vinculos do membro pelos nomes recebidos, em lote.

    O vocabulario e aberto por ora (P11): nome novo vira `Competencia` nova, do
    tipo da lista em que foi digitado. Quando P11 fechar num vocabulario
    controlado, e aqui que a validacao entra - a tela nao muda.

    Em lote, e nao nome por nome. A versao anterior fazia dois `get_or_create`
    por nome dentro do laco: treze nomes eram cinquenta e quatro consultas, e a
    tela aceita digitar quantos quiser. Contra um banco remoto cada uma delas e
    um RTT, e salvar um perfil levava segundos. O custo agora nao depende da
    quantidade de nomes - ver `core/tests/test_orcamento_de_queries.py`.

    O `ignore_conflicts` cobre a corrida com `uq_competencia_nome_categoria`: dois
    Supervisores digitando o mesmo nome novo ao mesmo tempo. Ele nao devolve as
    PKs das linhas que ja existiam, e por isso a releitura vem depois dele, e
    nao antes.
    """
    tipos = [tipo for campo, tipo in LISTAS.items() if campo in listas]

    if not tipos:
        return

    nomes_por_tipo = {
        tipo: list(
            dict.fromkeys(
                nome.strip()
                for nome in listas[campo]
                if nome and nome.strip()
            )
        )
        for campo, tipo in LISTAS.items()
        if campo in listas
    }

    desejados = {
        (nome, tipo)
        for tipo, nomes in nomes_por_tipo.items()
        for nome in nomes
    }

    membro.vinculos_competencia.filter(competencia__tipo__in=tipos).delete()

    if not desejados:
        _repor_vinculos_carregados(membro)
        return

    Competencia.objects.bulk_create(
        [Competencia(nome=nome, tipo=tipo) for nome, tipo in sorted(desejados)],
        ignore_conflicts=True,
    )

    identificadores = {
        (competencia.nome, competencia.tipo): competencia.pk
        for competencia in Competencia.objects.filter(
            nome__in={nome for nome, _ in desejados}, tipo__in=tipos
        )
    }

    MembroCompetencia.objects.bulk_create(
        [
            MembroCompetencia(
                membro=membro,
                competencia_id=identificadores[(nome, tipo)],
                declarado_por=DeclaradoPor.SUPERVISOR,
            )
            for nome, tipo in sorted(desejados)
        ]
    )

    _repor_vinculos_carregados(membro)


def _repor_vinculos_carregados(membro: MembroRede) -> None:
    """
    Troca o cache de `prefetch_related` da instancia pelo estado novo.

    O `get_queryset` do viewset carrega `vinculos_competencia`, e o
    `get_object` enche esse cache antes desta funcao trocar os vinculos.
    Serializar a mesma instancia depois devolvia a lista **velha**: a tela
    salvava e recebia de volta o estado anterior, sem erro nenhum. Nao e
    cosmetico - quem grava precisa poder ler o que gravou na mesma resposta
    (ver `RespostaDoSalvamentoDoCadastroTests`).

    Repoe em vez de so esvaziar, e com `select_related`, porque o cache vazio
    tambem tem custo: `to_representation` le `vinculo.competencia.tipo` para
    separar as tres listas, e sem a juncao isso volta a ser uma consulta por
    vinculo - a N+1 que acabou de sair do laco entraria de novo pela
    serializacao.

    O queryset entra sem ser avaliado de proposito: quem o consome sao as tres
    passadas de `_nomes`, e a primeira delas o resolve numa consulta so.
    """
    cache = getattr(membro, '_prefetched_objects_cache', None)
    chave = MembroCompetencia.membro.field.remote_field.cache_name

    if cache is None or chave not in cache:
        return

    cache[chave] = MembroCompetencia.objects.filter(
        membro=membro
    ).select_related('competencia')


def sincronizar_formacoes(
    membro: MembroRede, formacoes: list[dict[str, Any]] | None
) -> None:
    """
    Troca as formacoes do membro pelas recebidas.

    `None` e "o campo nao veio" e preserva o que existe; lista vazia remove
    tudo - a mesma regra das listas de competencia. O cache do
    `prefetch_related` e reposto pelo mesmo motivo de
    `_repor_vinculos_carregados`: a resposta do `PATCH` tem de trazer o que
    acabou de ser gravado.
    """
    if formacoes is None:
        return

    membro.formacoes.all().delete()
    Formacao.objects.bulk_create(
        [Formacao(membro=membro, **formacao) for formacao in formacoes]
    )

    cache = getattr(membro, '_prefetched_objects_cache', None)

    if cache is not None and 'formacoes' in cache:
        cache['formacoes'] = Formacao.objects.filter(membro=membro).select_related(
            'titulacao'
        )


class CadastrarMembroService:
    """
    O Supervisor poe a pessoa na rede (RF02).

    O cadastro nao cria conta: `situacao` nasce `sem_acesso` e `usuario` nulo.
    Liberar o acesso e o passo seguinte, e separado (RN-A04).
    """

    @transaction.atomic
    def execute(
        self,
        *,
        dados: dict[str, Any],
        listas: dict[str, list[str]],
        ator: Usuario,
        formacoes: list[dict[str, Any]] | None = None,
    ) -> MembroRede:
        dados = dict(dados)
        nome = dados.pop('nome')
        email = dados.pop('email').strip().lower()

        if MembroRede.objects.com_email(email).exists():
            raise ConflitoDeEstado(
                'Já existe alguém na rede com este e-mail.',
                codigo='email_duplicado',
            )

        membro = MembroRede.objects.create(
            **dados,
            nome_sem_conta=nome,
            email_sem_conta=email,
            situacao=SituacaoMembro.SEM_ACESSO,
            cadastrado_por=ator if isinstance(ator, Usuario) else None,
        )

        sincronizar_competencias(membro, listas)
        sincronizar_formacoes(membro, formacoes)

        registrar_evento(
            categoria=CategoriaEvento.REDE,
            tipo='membro_cadastrado',
            entidade='membro_rede',
            entidade_id=membro.id_membro,
            ator=getattr(ator, 'email', str(ator)),
            detalhe={'papel_rede': membro.papel_rede},
        )
        return membro


class AtualizarMembroService:
    """
    Edicao do cadastro pelo Supervisor (PB16).

    Nome e e-mail sao gravados onde moram: no membro, enquanto ele nao tem
    conta; na conta, depois do acesso liberado - o e-mail e o login dela.

    A trilha guarda quais campos mudaram, nao o antes e o depois: o valor
    antigo de nome, e-mail e experiencia ficaria nela para sempre (LGPD).
    """

    @transaction.atomic
    def execute(
        self,
        *,
        membro: MembroRede,
        dados: dict[str, Any],
        listas: dict[str, list[str]],
        ator: Usuario,
        formacoes: list[dict[str, Any]] | None = None,
    ) -> MembroRede:
        antes = {campo: getattr(membro, campo) for campo in dados}
        conta = membro.usuario
        identificacao = {
            campo: dados[campo] for campo in ('nome', 'email') if campo in dados
        }

        if 'email' in identificacao and identificacao['email'] != membro.email:
            garantir_email_livre(identificacao['email'], usuario=conta, membro=membro)

        if conta is not None:
            mudou_na_conta = [
                campo for campo, valor in identificacao.items()
                if getattr(conta, campo) != valor
            ]

            for campo in mudou_na_conta:
                setattr(conta, campo, identificacao[campo])

            if mudou_na_conta:
                conta.save(update_fields=[*mudou_na_conta, 'atualizado_em'])
        else:
            for campo, valor in identificacao.items():
                setattr(membro, f'{campo}_sem_conta', valor)

        for campo, valor in dados.items():
            if campo not in identificacao:
                setattr(membro, campo, valor)

        membro.save()
        sincronizar_competencias(membro, listas)
        sincronizar_formacoes(membro, formacoes)

        mudou = sorted(
            campo for campo in dados
            if str(antes[campo]) != str(getattr(membro, campo))
        )

        registrar_evento(
            categoria=CategoriaEvento.REDE,
            tipo='membro_atualizado',
            entidade='membro_rede',
            entidade_id=membro.id_membro,
            ator=getattr(ator, 'email', str(ator)),
            detalhe={
                'campos': mudou,
                'formacoes_alteradas': formacoes is not None,
            },
        )
        return membro


class LiberarAcessoMembroService:
    """
    Da login a quem ja esta na rede (PB08 / RN-A04).

    A conta nasce sem senha utilizavel e a pessoa define a dela pelo convite -
    mesma mecanica do provisionamento feito pelo Administrador.

    O cadastro e lido de novo, travado, antes de conferir: o envio do convite
    leva segundos, e um segundo clique nesse meio tempo recebe "acesso ja
    liberado" em vez de tentar criar a mesma conta. Se o e-mail nao sai, nada
    fica gravado: acesso liberado sem convite deixaria a pessoa sem como entrar.
    """

    def __init__(self, enviador: EnviadorDeEmail | None = None) -> None:
        self._email: EnviadorDeEmail = enviador or EnviadorDjango()

    @transaction.atomic
    def execute(self, *, membro: MembroRede, ator: Usuario) -> MembroRede:
        membro = MembroRede.objects.select_for_update().get(pk=membro.pk)

        if membro.usuario_id:
            raise ConflitoDeEstado(
                'Esta pessoa já tem acesso à plataforma.',
                codigo='acesso_ja_liberado',
            )

        if Usuario.objects.filter(email=membro.email).exists():
            raise ConflitoDeEstado(
                'Já existe uma conta com este e-mail.',
                codigo='email_em_uso',
            )

        papel = PAPEL_REDE_PARA_ACESSO.get(membro.papel_rede)

        if papel is None:
            raise ErroDeDominio(
                'Este papel na rede não dá acesso à plataforma.',
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

        membro.ligar_a_conta(usuario)
        membro.situacao = SituacaoMembro.ATIVO
        membro.save(
            update_fields=[
                'usuario', 'nome_sem_conta', 'email_sem_conta', 'situacao',
                'atualizado_em',
            ]
        )

        token = TokenAcesso.emitir(usuario, FinalidadeToken.CONVITE)

        try:
            self._email.convite_acesso(usuario, token)
        except OSError as erro:
            logger.warning(
                'Convite de acesso nao saiu (%s); a liberacao foi desfeita.',
                type(erro).__name__,
            )
            raise ServicoIndisponivel(
                'O convite não saiu por e-mail, e o acesso não foi liberado. '
                'Tente de novo em instantes.',
                codigo='convite_nao_enviado',
            ) from erro

        registrar_evento(
            categoria=CategoriaEvento.REDE,
            tipo='acesso_liberado',
            entidade='membro_rede',
            entidade_id=membro.id_membro,
            ator=getattr(ator, 'email', str(ator)),
            detalhe={'papel': papel},
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
        formacoes: list[dict[str, Any]] | None = None,
    ) -> MembroRede:
        for campo, valor in dados.items():
            setattr(membro, campo, valor)

        membro.save()
        sincronizar_competencias(membro, listas)
        sincronizar_formacoes(membro, formacoes)

        membro.vinculos_competencia.update(declarado_por=DeclaradoPor.MEMBRO)

        registrar_evento(
            categoria=CategoriaEvento.REDE,
            tipo='perfil_atualizado',
            entidade='membro_rede',
            entidade_id=membro.id_membro,
            ator=getattr(ator, 'email', str(ator)),
            detalhe={
                'campos': sorted(dados.keys())
                + sorted(listas.keys())
                + (['formacoes'] if formacoes is not None else [])
            },
        )
        return membro
