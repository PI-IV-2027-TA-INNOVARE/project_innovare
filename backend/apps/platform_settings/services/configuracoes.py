"""
Gravacao da configuracao administravel por JSON Merge Patch (RFC 7396).

O payload e guardado cru, sem defaults aplicados: com defaults dentro, um token
que o backend nunca gravou produziria diff vazio e a gravacao se perderia.
"""
from django.db import transaction

from apps.accounts.models import Usuario
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.platform_settings.models import ConfiguracaoPlataforma

SECAO_TEMA = 'tema'


def aplicar_merge_patch(alvo, patch):
    """
    RFC 7396: `null` remove a chave, chave ausente preserva o valor antigo e
    objeto desce um nivel. Qualquer outro valor substitui.
    """
    if not isinstance(patch, dict):
        return patch

    resultado = dict(alvo) if isinstance(alvo, dict) else {}

    for chave, valor in patch.items():
        if valor is None:
            resultado.pop(chave, None)
        else:
            resultado[chave] = aplicar_merge_patch(resultado.get(chave), valor)

    return resultado


def _folhas(documento, prefixo=''):
    if not isinstance(documento, dict):
        return {prefixo: documento} if prefixo else {}

    folhas = {}

    for chave, valor in documento.items():
        caminho = f'{prefixo}.{chave}' if prefixo else chave
        folhas.update(_folhas(valor, caminho) if isinstance(valor, dict) else {caminho: valor})

    return folhas


def alteracoes(antes, depois):
    """
    O que mudou entre dois documentos, por caminho (`light.accentPrimary`).

    `None` dos dois lados quer dizer ausente: chave removida volta ao padrao
    do front, e e isso que o `depois: None` registra.
    """
    folhas_antes, folhas_depois = _folhas(antes or {}), _folhas(depois or {})

    return {
        caminho: {'antes': folhas_antes.get(caminho), 'depois': folhas_depois.get(caminho)}
        for caminho in sorted(set(folhas_antes) | set(folhas_depois))
        if folhas_antes.get(caminho) != folhas_depois.get(caminho)
    }


def obter_configuracao(secao):
    """A secao gravada, ou `None` quando ninguem gravou ainda."""
    return (
        ConfiguracaoPlataforma.objects
        .select_related('atualizado_por')
        .filter(secao=secao)
        .first()
    )


class AtualizarConfiguracaoService:
    """
    Aplica o diff na secao, incrementa a revisao e registra quem gravou.

    Cada gravacao que muda algo entra na trilha com o antes e o depois de
    cada chave: o `atualizado_por` da secao so guarda o ultimo autor, e a
    pergunta de auditoria e sobre todos. Gravar o mesmo valor nao gera evento.
    """

    @transaction.atomic
    def execute(
        self, *, secao: str, patch: dict, ator: Usuario
    ) -> ConfiguracaoPlataforma:
        configuracao, _ = (
            ConfiguracaoPlataforma.objects
            .select_for_update()
            .get_or_create(secao=secao)
        )

        anterior = configuracao.payload
        configuracao.payload = aplicar_merge_patch(anterior, patch)
        mudancas = alteracoes(anterior, configuracao.payload)
        configuracao.revisao += 1
        configuracao.atualizado_por = ator
        configuracao.save(
            update_fields=['payload', 'revisao', 'atualizado_por', 'atualizado_em']
        )

        if mudancas:
            registrar_evento(
                categoria=CategoriaEvento.CONFIG,
                tipo='configuracao_alterada',
                entidade='configuracao',
                entidade_id=secao,
                ator=ator.email,
                detalhe={'revisao': configuracao.revisao, 'alteracoes': mudancas},
            )

        return configuracao
