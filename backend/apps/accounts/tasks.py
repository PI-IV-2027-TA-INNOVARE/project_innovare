"""Rotina agendada que apaga as sessoes vencidas."""
from celery import shared_task
from django.core.management import call_command


@shared_task(name='accounts.limpar_sessoes_vencidas')
def limpar_sessoes_vencidas() -> None:
    """
    Cada renovacao de sessao grava uma linha, e a vencida nao serve a mais
    nada: sem a limpeza, as duas tabelas de sessao so crescem.
    """
    call_command('flushexpiredtokens')
