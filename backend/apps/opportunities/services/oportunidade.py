"""
Casos de uso da Oportunidade (RF01, RF11, RF12).

Toda escrita relevante deixa evento na trilha: e o que PB70 cobra e o que a
tela de Historico le.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.conf import settings
from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.accounts.models import Papel, Usuario
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.decisions.models import Decisao, TipoDecisao
from apps.notifications.services import notificar
from apps.opportunities.models import (
    AnexoOportunidade,
    Oportunidade,
    OrigemOportunidade,
    SequenciaCodigo,
    SituacaoOportunidade,
)
from core.exceptions import AcaoNaoPermitida, ConflitoDeEstado, ErroDeDominio

if TYPE_CHECKING:
    from django.core.files.uploadedfile import UploadedFile

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
    """
    base = Oportunidade.objects.select_related(
        'demandante', 'responsavel', 'criado_por'
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
        return base.filter(equipe_potencial__membro__usuario=usuario).distinct()

    return base.none()


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
                    'Sua conta nao esta vinculada a uma organizacao demandante.',
                    codigo='sem_organizacao',
                )
        elif ator.papel == Papel.SUPERVISOR:
            origem = OrigemOportunidade.INTERNA
            demandante = None
        else:
            raise AcaoNaoPermitida(
                'Seu perfil nao cadastra oportunidade.',
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
                'Oportunidade arquivada nao recebe nova decisao.',
                codigo='ja_arquivada',
            )

        decisao = Decisao.objects.create(
            oportunidade=oportunidade,
            tipo=tipo,
            justificativa=justificativa,
            autor=ator,
        )

        oportunidade.situacao = SITUACAO_POR_DECISAO[tipo]
        oportunidade.save(update_fields=['situacao', 'atualizada_em'])

        registrar_evento(
            categoria=CategoriaEvento.DECISAO,
            tipo=f'decisao_{tipo}',
            entidade='oportunidade',
            entidade_id=oportunidade.codigo,
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
        if oportunidade.demandante_id is None:
            return Usuario.objects.none()

        return Usuario.objects.filter(
            organizacao_id=oportunidade.demandante_id, papel=Papel.DEMANDANTE
        )


class ComplementarOportunidadeService:
    """
    Resposta do Demandante ao pedido de revisao (PB27).

    Nao muda a situacao sozinha: quem reconduz o fluxo e o Supervisor. A
    maquina de estados completa e P13.
    """

    @transaction.atomic
    def execute(
        self, *, oportunidade: Oportunidade, texto: str, ator: Usuario
    ) -> Oportunidade:
        if oportunidade.situacao != SituacaoOportunidade.REVISAR:
            raise ConflitoDeEstado(
                'Nao ha pedido de complementacao em aberto nesta oportunidade.',
                codigo='sem_pedido_aberto',
            )

        oportunidade.contexto = (
            f'{oportunidade.contexto}\n\n[Complementacao de {ator.nome}]\n{texto}'
        ).strip()
        oportunidade.save(update_fields=['contexto', 'atualizada_em'])

        registrar_evento(
            categoria=CategoriaEvento.OPORTUNIDADE,
            tipo='complementacao_enviada',
            entidade='oportunidade',
            entidade_id=oportunidade.codigo,
            ator=ator.email,
            detalhe={'caracteres': len(texto)},
        )

        if oportunidade.responsavel and oportunidade.responsavel.usuario:
            notificar(
                usuario=oportunidade.responsavel.usuario,
                tipo='oportunidade.complementacao_recebida',
                titulo=f'{oportunidade.codigo} recebeu complementacao',
                mensagem=f'{ator.nome} respondeu ao pedido de revisao.',
                entidade='oportunidade',
                entidade_id=oportunidade.codigo,
            )

        return oportunidade


class AnexarDocumentoService:
    """
    Anexo vinculado a oportunidade (PB21).

    Limite de tamanho e tipos aceitos sao provisorios e vivem em `settings`: a
    politica definitiva, com retencao, e P14 - decisao do PO com o orientador,
    por causa de LGPD.
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

        mime = getattr(arquivo, 'content_type', '') or 'application/octet-stream'

        if mime not in settings.ANEXO_TIPOS_ACEITOS:
            raise ErroDeDominio(
                'Tipo de arquivo nao aceito nesta versao.',
                codigo='anexo_tipo_recusado',
            )

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
            ator=ator.email,
            detalhe={'nome': anexo.nome_original, 'bytes': anexo.tamanho_bytes},
        )
        return anexo
