"""
Leitura da trilha de auditoria.

A contraparte do `registro`: aquele grava, este consulta. Os dois num so
modulo misturariam o caminho append-only com o de leitura, e e justamente a
separacao que deixa obvio que nao ha update nem delete em lugar nenhum.
"""
from __future__ import annotations

from datetime import date

from django.db.models import Q, QuerySet

from apps.audit.models import CategoriaEvento, EventoAuditoria
from apps.audit.rotulos import ROTINA_OCULTA


def trilha(
    *,
    categoria: str | None = None,
    status: str | None = None,
    busca: str | None = None,
    desde: date | None = None,
    ate: date | None = None,
) -> QuerySet[EventoAuditoria]:
    """
    A trilha transversal do console, filtrada.

    Sem recorte por ator: quem chega aqui e o Administrador, e o console
    existe para ver a plataforma inteira. O recorte por oportunidade vive na
    aba Historico, que tem rota propria e filtra por entidade.

    `busca` cobre o ator (e-mail ou nome), o tipo, o id gravado e a
    oportunidade (codigo ou titulo) - o que a tela mostra de cada linha.

    Login e logout bem-sucedidos so aparecem com a categoria "Conta e acesso"
    escolhida: sao a maior parte da trilha e nada dizem sobre o fluxo. Entrada
    recusada nao e rotina e continua visivel em qualquer recorte.

    O desempate por `-id_evento` importa: varios eventos do mesmo caso de uso
    nascem no mesmo `ocorrido_em`, e sem ele a ordem entre eles muda de uma
    consulta para outra, fazendo a paginacao repetir ou pular linha.
    """
    eventos = EventoAuditoria.objects.all()

    if categoria:
        eventos = eventos.filter(categoria=categoria)

    if categoria != CategoriaEvento.CONTA:
        eventos = eventos.exclude(tipo__in=ROTINA_OCULTA)

    if status:
        eventos = eventos.filter(status=status)

    if desde:
        eventos = eventos.filter(ocorrido_em__date__gte=desde)

    if ate:
        eventos = eventos.filter(ocorrido_em__date__lte=ate)

    termo = (busca or '').strip()

    if termo:
        from apps.accounts.models import Usuario

        eventos = eventos.filter(
            Q(ator__icontains=termo)
            | Q(ator__in=Usuario.objects.filter(nome__icontains=termo).values('email'))
            | Q(entidade_id__icontains=termo)
            | Q(tipo__icontains=termo)
            | Q(oportunidade__codigo__icontains=termo)
            | Q(oportunidade__titulo__icontains=termo)
        )

    return eventos.select_related('oportunidade').order_by('-ocorrido_em', '-id_evento')
