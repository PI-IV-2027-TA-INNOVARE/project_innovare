"""
Casos de uso da Oportunidade (RF01, RF11, RF12).

Toda escrita relevante deixa evento na trilha: e o que PB70 cobra e o que a
tela de Historico le.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.conf import settings
from django.db import transaction
from django.db.models import (
    BooleanField,
    Case,
    Count,
    Exists,
    OuterRef,
    Prefetch,
    Q,
    QuerySet,
    Subquery,
    Value,
    When,
)
from django.utils import timezone

from apps.accounts.models import Papel, Usuario
from apps.audit.models import CategoriaEvento, EventoAuditoria
from apps.audit.services import registrar_evento
from apps.decisions.models import Decisao, TipoDecisao
from apps.notifications.services import notificar
from apps.opportunities.models import (
    CATEGORIAS_VISIVEIS_AO_DEMANDANTE,
    AnexoOportunidade,
    Oportunidade,
    OrigemOportunidade,
    SequenciaCodigo,
    SituacaoOportunidade,
)
from apps.opportunities.services.tipo_do_anexo import tipo_conferido
from core.exceptions import (
    AcaoNaoPermitida,
    ConflitoDeEstado,
    ErroDeDominio,
    RecursoNaoEncontrado,
)

if TYPE_CHECKING:
    from django.core.files.uploadedfile import UploadedFile

QUEM_AGIU_PELA_AC2 = 'Núcleo de P&D da AC2'
"""Como o historico do Demandante nomeia quem agiu pela AC2, sem o e-mail (PB71)."""


def _do_demandante(usuario: Usuario) -> bool:
    return usuario.papel == Papel.DEMANDANTE


def _enviado_pela_empresa(usuario: Usuario, prefixo: str) -> Q:
    """
    O que um Demandante da empresa do ator fez. O papel conta tanto quanto a
    organizacao: um ator interno com a organizacao errada continua sendo a AC2.
    """
    return Q(**{
        f'{prefixo}__organizacao_id': usuario.organizacao_id,
        f'{prefixo}__papel': Papel.DEMANDANTE,
    })


def anexos_visiveis(oportunidade: Oportunidade, usuario: Usuario) -> QuerySet[AnexoOportunidade]:
    """
    Os anexos que o ator le (PB21 e PB71).

    O Demandante ve o que a empresa dele enviou: o que a AC2 anexa e trabalho
    interno, e PB71 o deixa so com o andamento. Os outros atores que alcancam
    a oportunidade veem todos.
    """
    anexos = oportunidade.anexos.all()

    if not _do_demandante(usuario):
        return anexos

    if usuario.organizacao_id is None:
        return anexos.none()

    return anexos.filter(_enviado_pela_empresa(usuario, 'enviado_por'))


SITUACAO_POR_DECISAO = {
    TipoDecisao.CONTINUAR: SituacaoOportunidade.CONTINUAR,
    TipoDecisao.REVISAR: SituacaoOportunidade.REVISAR,
    TipoDecisao.ARQUIVAR: SituacaoOportunidade.ARQUIVADA,
}


def escopo_de(usuario: Usuario) -> QuerySet[Oportunidade]:
    """
    O que cada ator alcanca (CONTEXT.md secao 3).

    Portao real da leitura. A rota e ergonomia; e este queryset que impede o
    Demandante de ler o problema de outra organizacao.

    O Pesquisador alcanca a oportunidade por uma indicacao `incluido`. Estar
    fora da geracao mais recente nao retira o acompanhamento - cada execucao
    de matching cria uma `EquipePotencial` nova, e as anteriores continuam
    sendo composicoes validas. Quem retira alguem e o Supervisor, desmarcando
    `incluido` (RN-A06).
    """
    base = Oportunidade.objects.select_related(
        'demandante', 'responsavel__usuario', 'criado_por'
    )

    if usuario.papel == Papel.SUPERVISOR:
        return base

    if usuario.papel == Papel.DEMANDANTE:
        if usuario.organizacao_id is None:
            return base.none()
        return base.filter(
            origem=OrigemOportunidade.EXTERNO,
            demandante_id=usuario.organizacao_id,
        )

    if usuario.papel == Papel.PESQUISADOR:
        return base.filter(
            equipes_potenciais__membros__membro__usuario=usuario,
            equipes_potenciais__membros__incluido=True,
        ).distinct()

    return base.none()


def _aguarda_atuacao_de(usuario: Usuario):
    """
    Onde a vez e do Supervisor (PB61), com o que o modelo ja tem.

    Tres casos: a oportunidade que ninguem comecou (`entrada`), a que espera
    a decisao, e a que voltou de *Revisar* e ja tem a resposta do Demandante
    - complementar nao muda a situacao (quem reconduz e o Supervisor), entao a
    resposta so aparece na trilha, depois da ultima decisao *Revisar*.

    "Minha" e a que ele conduz ou que ainda nao tem responsavel. Prioridade
    nao entra: e campo que o PO ainda precisa definir.
    """
    if usuario.papel != Papel.SUPERVISOR:
        return Value(False, output_field=BooleanField())

    ultima_revisao = (
        Decisao.objects.filter(
            oportunidade=OuterRef(OuterRef('pk')),
            tipo_decisao=TipoDecisao.REVISAR,
        )
        .order_by('-registrada_em')
        .values('registrada_em')[:1]
    )
    respondeu = EventoAuditoria.objects.filter(
        oportunidade=OuterRef('pk'),
        tipo='complementacao_enviada',
        ocorrido_em__gt=Subquery(ultima_revisao),
    )

    minha = Q(responsavel__isnull=True) | Q(responsavel__usuario=usuario)
    vez_dele = Q(
        situacao__in=[
            SituacaoOportunidade.ENTRADA,
            SituacaoOportunidade.AGUARDANDO_DECISAO,
        ]
    ) | (Q(situacao=SituacaoOportunidade.REVISAR) & Q(Exists(respondeu)))

    return Case(
        When(minha & vez_dele, then=Value(True)),
        default=Value(False),
        output_field=BooleanField(),
    )


def fila_de(usuario: Usuario) -> QuerySet[Oportunidade]:
    """
    O escopo do ator, pronto para a tela de acompanhamento ler.

    Separado de `escopo_de` de proposito. `escopo_de` e o portao de seguranca,
    e tem um segundo consumidor que agrega sobre ele (`indicadores_de`, via
    `pk__in`): carregar `total_anexos` e `decisoes` ali poria um `GROUP BY` e um
    lote de decisoes dentro de uma subconsulta que so quer `pk`.

    O que esta aqui e o custo de leitura da fila. Sem isto o serializer
    resolvia `total_anexos` e `ultima_decisao` um registro por vez: o front
    pede `page_size=100`, e eram 200 consultas numa tela - cada uma um RTT
    quando o banco nao esta na mesma maquina. Ver
    `core/tests/test_orcamento_de_queries.py`.

    O `distinct=True` na contagem nao e enfeite: o escopo do Pesquisador chega
    aqui com juncao por equipe, e sem ele cada anexo seria contado uma vez por
    indicacao.

    O `order_by` explicito tambem nao. A contagem poe um `GROUP BY` na
    consulta, e com `GROUP BY` o Django deixa de aplicar o `Meta.ordering` da
    Oportunidade: o SQL sai **sem `ORDER BY`**, sem aviso. Sem ordem total o
    `LIMIT/OFFSET` da paginacao escolhe linha diferente a cada pagina, e a
    pagina 2 repete ou pula o que a 1 mostrou. O `codigo` desempata porque e
    unico - dois registros salvos no mesmo instante ficariam a merce do plano
    de execucao.
    """
    visiveis = (
        _enviado_pela_empresa(usuario, 'anexos__enviado_por')
        if _do_demandante(usuario)
        else None
    )

    return escopo_de(usuario).annotate(
        total_anexos=Count('anexos', filter=visiveis, distinct=True),
        aguarda_minha_atuacao=_aguarda_atuacao_de(usuario),
    ).prefetch_related(
        Prefetch('decisoes', queryset=Decisao.objects.select_related('responsavel'))
    ).order_by('-atualizada_em', '-codigo')


def historico_de(
    oportunidade: Oportunidade, usuario: Usuario
) -> QuerySet[EventoAuditoria]:
    """
    A trilha da oportunidade que cabe a cada ator ler (RF12 / PB69, PB70).

    O Demandante nao ve as categorias internas: PB71 diz que ele acompanha o
    andamento "sem acessar informacoes internas restritas (ex.: resultados de
    matching, pre-analise detalhada)". O recorte e aqui, no servidor, e nao na
    tela.

    O evento entra pela FK ou pela referencia textual: a FK e opcional, e ha
    evento registrado so com `entidade`/`entidade_id`.

    O anexo enviado pela AC2 tambem sai da trilha do Demandante: o evento
    guarda o nome do arquivo, e o arquivo ele nao ve (`anexos_visiveis`).
    """
    eventos = EventoAuditoria.objects.filter(
        Q(oportunidade=oportunidade)
        | Q(entidade='oportunidade', entidade_id=oportunidade.codigo)
    ).select_related('conta_do_ator').order_by('-ocorrido_em')

    if _do_demandante(usuario):
        if usuario.organizacao_id is None:
            return eventos.none()

        anexo_interno = Q(tipo='anexo_enviado') & ~_enviado_pela_empresa(usuario, 'conta_do_ator')
        return eventos.filter(categoria__in=CATEGORIAS_VISIVEIS_AO_DEMANDANTE).exclude(
            anexo_interno
        )

    return eventos


def nomes_de_quem_agiu(eventos) -> dict[str, str]:
    """
    O nome de cada e-mail da trilha, lido da conta na hora.

    A trilha guarda o e-mail, nao o nome: se a pessoa muda de nome, ou a conta
    e anonimizada, o historico mostra o que vale hoje.
    """
    emails = {evento.ator for evento in eventos}

    return dict(Usuario.objects.filter(email__in=emails).values_list('email', 'nome'))


def contexto_do_historico(eventos, usuario: Usuario) -> dict[str, Any]:
    """
    O que o serializer da trilha precisa para nomear quem agiu.

    Para o Demandante, quem agiu fora da empresa dele aparece como a AC2, sem
    e-mail: e quem trabalha na oportunidade por dentro (PB71).
    """
    contexto: dict[str, Any] = {'nomes': nomes_de_quem_agiu(eventos)}

    if _do_demandante(usuario):
        contexto['organizacao_do_demandante'] = usuario.organizacao_id
        contexto['quem_agiu_pela_ac2'] = QUEM_AGIU_PELA_AC2

    return contexto


class CadastrarOportunidadeService:
    """
    As duas portas de entrada do fluxo (RF01).

    A origem vem do ator, nao do corpo: Demandante abre problema externo (D01),
    Supervisor abre ideia interna (RN-A03 / D05). A restricao de banco
    `ck_oportunidade_origem_demandante` sustenta a mesma regra.
    """

    @transaction.atomic
    def execute(self, *, dados: dict[str, Any], ator: Usuario) -> Oportunidade:
        if ator.papel == Papel.DEMANDANTE:
            origem = OrigemOportunidade.EXTERNO
            demandante = ator.organizacao

            if demandante is None:
                raise ErroDeDominio(
                    'Sua conta ainda não está ligada a uma empresa. Fale com o administrador.',
                    codigo='sem_organizacao',
                )
        elif ator.papel == Papel.SUPERVISOR:
            origem = OrigemOportunidade.INTERNA
            demandante = None
        else:
            raise AcaoNaoPermitida(
                'Seu perfil não cadastra oportunidade.',
                codigo='papel_nao_cadastra',
            )

        oportunidade = Oportunidade.objects.create(
            codigo=SequenciaCodigo.proximo_codigo(timezone.now().year),
            origem=origem,
            demandante=demandante,
            criado_por=ator,
            situacao=SituacaoOportunidade.ENTRADA,
            **dados,
        )

        registrar_evento(
            categoria=CategoriaEvento.OPORTUNIDADE,
            tipo='oportunidade_cadastrada',
            entidade='oportunidade',
            entidade_id=oportunidade.codigo,
            oportunidade=oportunidade,
            ator=ator.email,
            detalhe={'origem': origem, 'titulo': oportunidade.titulo},
        )
        return oportunidade


class AtualizarContextoService:
    """Edicao do contexto pelo Supervisor (PB20)."""

    @transaction.atomic
    def execute(
        self,
        *,
        oportunidade: Oportunidade,
        dados: dict[str, Any],
        ator: Usuario,
    ) -> Oportunidade:
        antes = {campo: getattr(oportunidade, campo) for campo in dados}

        for campo, valor in dados.items():
            setattr(oportunidade, campo, valor)

        oportunidade.save()

        mudou = [
            campo for campo in dados
            if str(antes[campo]) != str(getattr(oportunidade, campo))
        ]

        registrar_evento(
            categoria=CategoriaEvento.OPORTUNIDADE,
            tipo='contexto_atualizado',
            entidade='oportunidade',
            entidade_id=oportunidade.codigo,
            oportunidade=oportunidade,
            ator=ator.email,
            detalhe={'campos': sorted(mudou)},
        )
        return oportunidade


class RegistrarDecisaoService:
    """
    O fecho do fluxo (RF11 / RN-A07 / D03).

    Quando o desfecho e *Revisar*, o Demandante precisa saber que a bola voltou
    para ele: PB26 exige a notificacao, e sem ela o pedido so aparece se a
    pessoa por acaso abrir a tela.
    """

    @transaction.atomic
    def execute(
        self,
        *,
        oportunidade: Oportunidade,
        tipo: str,
        justificativa: str,
        ator: Usuario,
    ) -> Decisao:
        if oportunidade.situacao == SituacaoOportunidade.ARQUIVADA:
            raise ConflitoDeEstado(
                'Oportunidade arquivada não recebe nova decisão.',
                codigo='ja_arquivada',
            )

        decisao = Decisao.objects.create(
            oportunidade=oportunidade,
            tipo_decisao=tipo,
            observacoes=justificativa,
            responsavel=ator,
        )

        oportunidade.situacao = SITUACAO_POR_DECISAO[tipo]
        oportunidade.save(update_fields=['situacao', 'atualizada_em'])

        registrar_evento(
            categoria=CategoriaEvento.DECISAO,
            tipo=f'decisao_{tipo}',
            entidade='oportunidade',
            entidade_id=oportunidade.codigo,
            oportunidade=oportunidade,
            ator=ator.email,
            detalhe={'tipo': tipo, 'id_decisao': decisao.id_decisao},
        )

        if tipo == TipoDecisao.REVISAR:
            self._avisar_demandante(oportunidade, justificativa)

        return decisao

    def _avisar_demandante(
        self, oportunidade: Oportunidade, justificativa: str
    ) -> None:
        contas = self._contas_do_demandante(oportunidade)

        for conta in contas:
            notificar(
                usuario=conta,
                tipo='oportunidade.complementacao_solicitada',
                titulo=f'{oportunidade.codigo} precisa de complementacao',
                mensagem=justificativa,
                entidade='oportunidade',
                entidade_id=oportunidade.codigo,
            )

    def _contas_do_demandante(self, oportunidade: Oportunidade) -> QuerySet[Usuario]:
        return _contas_do_demandante_de(oportunidade)


TIPO_COMPLEMENTO_SOLICITADO = 'complemento_solicitado'
TIPO_COMPLEMENTACAO_ENVIADA = 'complementacao_enviada'
MARCA_DA_COMPLEMENTACAO = '[Complementação do Demandante]'
"""
O contexto vai para a IA, e o nome de quem respondeu nao precisa ir junto
(LGPD, minimizacao): quem foi esta na trilha.
"""


def ha_pedido_de_complemento_aberto(oportunidade: Oportunidade) -> bool:
    """
    Se existe pedido da PB26 ainda sem resposta.

    O estado sai da **trilha**, e nao de coluna nova: ela e append-only, ja e a
    fonte do Historico e `RegistrarObservacaoService` abriu o precedente de
    guardar fato de fluxo nela. Uma coluna aqui seria migration - portao de
    decisao (AGENTS.md 3.2) - para derivar o que os dois eventos ja dizem.

    Aberto = o ultimo dos dois eventos e o pedido. Se a resposta vier depois, o
    pedido esta fechado; se o Supervisor pedir de novo, reabre.
    """
    from apps.audit.models import EventoAuditoria

    ultimo = (
        EventoAuditoria.objects
        .filter(
            entidade='oportunidade',
            entidade_id=oportunidade.codigo,
            tipo__in=(TIPO_COMPLEMENTO_SOLICITADO, TIPO_COMPLEMENTACAO_ENVIADA),
        )
        .order_by('-ocorrido_em', '-id_evento')
        .values_list('tipo', flat=True)
        .first()
    )

    return ultimo == TIPO_COMPLEMENTO_SOLICITADO


class SolicitarComplementoService:
    """
    O pedido de informacao complementar ao Demandante (PB26).

    Separado da decisao `Revisar` (PB64) de proposito. Decidir registra um
    desfecho (RN-A07) e move a situacao; **perguntar nao e nenhum dos dois**.
    Enquanto o pedido saia de carona na decisao, tirar uma duvida obrigava o
    Supervisor a encerrar a avaliacao, e a trilha enchia de decisoes que nao
    decidiram nada.

    Por isso aqui a situacao fica onde esta: quem move o fluxo e a Decisao. O
    que este servico deixa e um pedido aberto na trilha, que e o que destrava a
    resposta da PB27.
    """

    @transaction.atomic
    def execute(
        self, *, oportunidade: Oportunidade, mensagem: str, ator: Usuario
    ) -> dict[str, Any]:
        contas = _contas_do_demandante_de(oportunidade)

        if not contas.exists():
            raise ConflitoDeEstado(
                'Esta oportunidade não tem Demandante Externo a quem pedir '
                'complementação.',
                codigo='sem_demandante',
            )

        evento = registrar_evento(
            categoria=CategoriaEvento.OPORTUNIDADE,
            tipo=TIPO_COMPLEMENTO_SOLICITADO,
            entidade='oportunidade',
            entidade_id=oportunidade.codigo,
            oportunidade=oportunidade,
            ator=ator.email,
            detalhe={'mensagem': mensagem},
        )

        for conta in contas:
            notificar(
                usuario=conta,
                tipo='oportunidade.complementacao_solicitada',
                titulo=f'{oportunidade.codigo} precisa de complementacao',
                mensagem=mensagem,
                entidade='oportunidade',
                entidade_id=oportunidade.codigo,
            )

        return {
            'ocorrido_em': evento.ocorrido_em,
            'mensagem': mensagem,
            'autor_nome': ator.nome,
        }


def _contas_do_demandante_de(oportunidade: Oportunidade) -> QuerySet[Usuario]:
    """As contas que respondem pela organizacao demandante da oportunidade."""
    if oportunidade.demandante_id is None:
        return Usuario.objects.none()

    return Usuario.objects.filter(
        organizacao_id=oportunidade.demandante_id, papel=Papel.DEMANDANTE
    )


class ComplementarOportunidadeService:
    """
    Resposta do Demandante ao pedido de complementacao (PB27).

    Dois caminhos abrem a resposta: a decisao `Revisar` (PB64), que devolve a
    oportunidade inteira, e o pedido avulso da PB26, que so pergunta. Exigir
    `REVISAR` aqui deixava a PB26 sem resposta possivel - o pedido chegava ao
    Demandante e o `complementar` o recusava com `sem_pedido_aberto`.

    Nao muda a situacao sozinha: quem reconduz o fluxo e o Supervisor. A
    maquina de estados completa e P13.

    Nao notifica o Supervisor: a caixa de avisos e do Demandante Externo (PB26).
    A PB27 promete que a resposta "fica visivel ao Supervisor" - e o lugar disso
    e a propria oportunidade e a aba Historico, nao um sino que o backlog nao
    descreveu para nenhum ator alem do Demandante.
    """

    @transaction.atomic
    def execute(
        self, *, oportunidade: Oportunidade, texto: str, ator: Usuario
    ) -> Oportunidade:
        em_revisao = oportunidade.situacao == SituacaoOportunidade.REVISAR

        if not em_revisao and not ha_pedido_de_complemento_aberto(oportunidade):
            raise ConflitoDeEstado(
                'Não há pedido de complementação em aberto nesta oportunidade.',
                codigo='sem_pedido_aberto',
            )

        oportunidade.contexto = (
            f'{oportunidade.contexto}\n\n{MARCA_DA_COMPLEMENTACAO}\n{texto}'
        ).strip()
        oportunidade.save(update_fields=['contexto', 'atualizada_em'])

        registrar_evento(
            categoria=CategoriaEvento.OPORTUNIDADE,
            tipo='complementacao_enviada',
            entidade='oportunidade',
            entidade_id=oportunidade.codigo,
            oportunidade=oportunidade,
            ator=ator.email,
            detalhe={'caracteres': len(texto)},
        )

        return oportunidade


class RegistrarObservacaoService:
    """
    Nota do Supervisor durante a avaliacao (PB65).

    Nao e decisao e nao mexe na situacao: a Decisao fecha o fluxo e exige um
    desfecho (RN-A07), enquanto a observacao documenta o raciocinio enquanto
    ele acontece. Por isso ela nasce direto na trilha append-only, sem tabela
    propria - PB65 pede exatamente que ela fique "vinculada a oportunidade e
    visivel no historico", que e o que a trilha ja e.
    """

    @transaction.atomic
    def execute(
        self, *, oportunidade: Oportunidade, texto: str, ator: Usuario
    ) -> dict[str, Any]:
        evento = registrar_evento(
            categoria=CategoriaEvento.OBSERVACAO,
            tipo='observacao_registrada',
            entidade='oportunidade',
            entidade_id=oportunidade.codigo,
            oportunidade=oportunidade,
            ator=ator.email,
            detalhe={'texto': texto},
        )

        return {
            'ocorrido_em': evento.ocorrido_em,
            'texto': texto,
            'autor_nome': ator.nome,
        }


def documento_da_oportunidade(
    oportunidade: Oportunidade, id_anexo, usuario: Usuario
) -> AnexoOportunidade:
    """
    O anexo desta oportunidade, ou 404 - o de outra nao sai por esta rota, nem
    o que o ator nao le (`anexos_visiveis`).
    """
    anexo = anexos_visiveis(oportunidade, usuario).filter(pk=id_anexo).first()

    if anexo is None or not anexo.arquivo:
        raise RecursoNaoEncontrado(
            'Documento não encontrado nesta oportunidade.', codigo='anexo_inexistente'
        )

    return anexo


class AnexarDocumentoService:
    """
    Anexo vinculado a oportunidade (PB21).

    Limite de tamanho e tipos aceitos sao provisorios e vivem em `settings`: a
    politica definitiva, com retencao, e P14 - decisao do PO com o orientador,
    por causa de LGPD.

    O tipo gravado e o conferido pelo conteudo do arquivo, nao o que o
    navegador declarou (`tipo_do_anexo`).
    """

    @transaction.atomic
    def execute(
        self, *, oportunidade: Oportunidade, arquivo: UploadedFile, ator: Usuario
    ) -> AnexoOportunidade:
        limite = settings.ANEXO_TAMANHO_MAXIMO_MB * 1024 * 1024

        if arquivo.size > limite:
            raise ErroDeDominio(
                f'Arquivo acima de {settings.ANEXO_TAMANHO_MAXIMO_MB} MB.',
                codigo='anexo_grande_demais',
            )

        mime = tipo_conferido(arquivo, arquivo.name)

        anexo = AnexoOportunidade.objects.create(
            oportunidade=oportunidade,
            arquivo=arquivo,
            nome_original=arquivo.name[:255],
            mime=mime,
            tamanho_bytes=arquivo.size,
            enviado_por=ator,
        )

        registrar_evento(
            categoria=CategoriaEvento.OPORTUNIDADE,
            tipo='anexo_enviado',
            entidade='oportunidade',
            entidade_id=oportunidade.codigo,
            oportunidade=oportunidade,
            ator=ator.email,
            detalhe={'nome': anexo.nome_original, 'bytes': anexo.tamanho_bytes},
        )
        return anexo
