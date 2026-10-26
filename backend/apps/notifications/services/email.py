"""
Os avisos que tambem saem por e-mail (PB26 / P17).

Sao tres, as decisoes que mudam o rumo do problema do Demandante: Revisar,
Continuar e Arquivar. O aviso na plataforma continua como esta; o e-mail diz o
que aconteceu e onde acompanhar.

O texto nao leva nada interno: nem observacao, nem equipe, nem prioridade, nem
quem decidiu (PB71). A justificativa so vai no Revisar, porque e o pedido de
complementacao que o Demandante precisa ler; nas outras duas ela e raciocinio
interno, como em `ultima_decisao`.

Desligado por `SEND_NOTIFICATION_EMAILS`. Em teste o backend e `locmem`, e
nenhum e-mail sai (AGENTS.md 0.1).
"""
from __future__ import annotations

import logging
import smtplib

from django.conf import settings
from django.core.mail import send_mass_mail

from apps.accounts.models import Papel, SituacaoConta, Usuario
from apps.accounts.services.titular import DOMINIO_ANONIMO
from apps.decisions.models import TipoDecisao

logger = logging.getLogger(__name__)

QUEM_DECIDE = 'O Núcleo de P&D da AC2'


def _link(codigo: str) -> str:
    return f'{settings.FRONTEND_URL.rstrip("/")}/problemas/{codigo}'


def _texto(*, nome: str, codigo: str, titulo: str, tipo: str, justificativa: str) -> tuple[str, str]:
    link = _link(codigo)

    if tipo == TipoDecisao.REVISAR:
        return (
            f'P&D Connect - {codigo} precisa de complementação',
            f'Olá, {nome}.\n\n'
            f'{QUEM_DECIDE} pediu complementação no problema "{titulo}" ({codigo}):\n\n'
            f'{justificativa}\n\n'
            f'Responda pela plataforma: {link}\n',
        )

    if tipo == TipoDecisao.CONTINUAR:
        return (
            f'P&D Connect - {codigo} vai continuar',
            f'Olá, {nome}.\n\n'
            f'{QUEM_DECIDE} concluiu a avaliação do problema "{titulo}" ({codigo}) '
            'e decidiu dar continuidade a ele.\n\n'
            f'Acompanhe pela plataforma: {link}\n',
        )

    return (
        f'P&D Connect - {codigo} foi arquivado',
        f'Olá, {nome}.\n\n'
        f'{QUEM_DECIDE} arquivou o problema "{titulo}" ({codigo}). '
        'O histórico continua disponível na plataforma.\n\n'
        f'Consulte pela plataforma: {link}\n',
    )


def contas_avisadas(id_organizacao: int | None):
    """As contas ativas que respondem pela empresa demandante, menos as anonimizadas."""
    if id_organizacao is None:
        return Usuario.objects.none()

    return (
        Usuario.objects.filter(
            organizacao_id=id_organizacao,
            papel=Papel.DEMANDANTE,
            situacao=SituacaoConta.ATIVO,
        )
        .exclude(email__endswith=f'@{DOMINIO_ANONIMO}')
        .order_by('pk')
    )


def avisar_decisao_por_email(
    *,
    id_organizacao: int | None,
    codigo: str,
    titulo: str,
    tipo: str,
    justificativa: str,
) -> int:
    """
    Uma mensagem por conta, para nenhum destinatario ver o endereco do outro.

    Falha de envio nao desfaz a decisao: ela ja esta gravada e o aviso na
    plataforma ja saiu. O log diz que falhou, sem o endereco.
    """
    if not settings.SEND_NOTIFICATION_EMAILS:
        return 0

    mensagens = [
        (
            *_texto(
                nome=conta.nome,
                codigo=codigo,
                titulo=titulo,
                tipo=tipo,
                justificativa=justificativa,
            ),
            settings.DEFAULT_FROM_EMAIL,
            [conta.email],
        )
        for conta in contas_avisadas(id_organizacao)
    ]

    if not mensagens:
        return 0

    try:
        return send_mass_mail(mensagens, fail_silently=False)
    except (OSError, smtplib.SMTPException) as erro:
        logger.warning(
            'Aviso de decisao por e-mail nao saiu (%s) para %s.',
            type(erro).__name__,
            codigo,
        )
        return 0
