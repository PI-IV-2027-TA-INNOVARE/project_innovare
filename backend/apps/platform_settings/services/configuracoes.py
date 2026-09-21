"""
Gravacao da configuracao administravel por JSON Merge Patch (RFC 7396).

O payload e guardado cru, sem defaults aplicados: com defaults dentro, um token
que o backend nunca gravou produziria diff vazio e a gravacao se perderia.
"""
from django.db import transaction

from apps.accounts.models import Usuario
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


def obter_configuracao(secao):
    """A secao gravada, ou `None` quando ninguem gravou ainda."""
    return (
        ConfiguracaoPlataforma.objects
        .select_related('atualizado_por')
        .filter(secao=secao)
        .first()
    )


class AtualizarConfiguracaoService:
    """Aplica o diff na secao, incrementa a revisao e registra quem gravou."""

    @transaction.atomic
    def execute(
        self, *, secao: str, patch: dict, ator: Usuario
    ) -> ConfiguracaoPlataforma:
        configuracao, _ = (
            ConfiguracaoPlataforma.objects
            .select_for_update()
            .get_or_create(secao=secao)
        )

        configuracao.payload = aplicar_merge_patch(configuracao.payload, patch)
        configuracao.revisao += 1
        configuracao.atualizado_por = ator
        configuracao.save(
            update_fields=['payload', 'revisao', 'atualizado_por', 'atualizado_em']
        )

        return configuracao
