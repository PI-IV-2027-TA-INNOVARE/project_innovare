"""Tarefas de maturidade na fila (SPEC-14)."""
from celery import shared_task

from apps.accounts.models import Usuario
from apps.ai.models import StatusExecucao
from apps.maturity.models import PreAnalise
from apps.maturity.services import PreAnalisarService


@shared_task(name='maturity.pre_analisar')
def pre_analisar(pre_analise_id: str, ator_id: str) -> str:
    """
    Processa uma pre-analise pendente no worker.

    A tarefa e idempotente: se a linha ja saiu de `pendente` (outra entrega
    pegou a tarefa), ela nao chama o provedor de novo. Sem isso, um reenvio da
    fila cobraria duas vezes a mesma analise.
    """
    try:
        analise = PreAnalise.objects.select_related(
            'proposta__oportunidade', 'versao_criterio'
        ).get(pk=pre_analise_id)
    except PreAnalise.DoesNotExist:
        return 'inexistente'

    if analise.status != StatusExecucao.PENDENTE:
        return analise.status

    try:
        ator = Usuario.objects.get(pk=ator_id)
    except Usuario.DoesNotExist:
        analise.status = StatusExecucao.ERRO
        analise.erro = 'ator_indisponivel'
        analise.save(update_fields=['status', 'erro'])
        return StatusExecucao.ERRO

    PreAnalisarService().processar(analise=analise, ator=ator)

    return analise.status
