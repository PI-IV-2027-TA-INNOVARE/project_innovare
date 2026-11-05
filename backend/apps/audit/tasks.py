"""Rotina agendada de retencao de dados pessoais (LGPD, SPEC-17)."""
from celery import shared_task

from apps.audit.services.retencao import AplicarRetencaoService


@shared_task(name='audit.aplicar_retencao')
def aplicar_retencao() -> dict[str, int]:
    resultado = AplicarRetencaoService().execute(aplicar=True)

    return {
        'eventos_anonimizados': resultado.eventos_anonimizados,
        'anexos_descartados': resultado.anexos_descartados,
    }
