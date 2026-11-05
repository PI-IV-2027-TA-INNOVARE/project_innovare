"""
Consulta da rede interna: ordem da lista e resumo da rede inteira.

A lista vem em paginas, entao a ordem tem de sair do banco: ordenar a pagina
no navegador so ordena 20 pessoas. O resumo conta a rede inteira, sem filtro
e sem pagina, e e o que os numeros do topo da tela mostram.
"""
from __future__ import annotations

from django.db.models import F, QuerySet

from apps.network.models import MembroRede, SituacaoMembro, TipoCompetencia

TITULACOES_DE_MESTRE_OU_DOUTOR = ('mestrado', 'doutorado', 'pos_doutorado')

CAMPOS_DE_ORDEM = {
    'nome': 'nome_atual',
    'papel': 'papel_rede',
    'titulacao': 'titulacao__nivel',
    'situacao': 'situacao',
    'disponibilidade': 'disponibilidade',
}

ORDENS_DA_REDE = tuple(
    chave for campo in CAMPOS_DE_ORDEM for chave in (campo, f'-{campo}')
)


def ordenar_rede(queryset: QuerySet[MembroRede], ordem: str) -> QuerySet[MembroRede]:
    """A ordem pedida, com o nome como desempate e quem nao tem titulacao no inicio."""
    decrescente = ordem.startswith('-')
    campo = F(CAMPOS_DE_ORDEM[ordem.lstrip('-')])
    principal = campo.desc(nulls_last=True) if decrescente else campo.asc(nulls_first=True)

    return queryset.order_by(principal, 'nome_atual')


def resumo_da_rede() -> dict[str, int]:
    rede = MembroRede.objects.all()

    return {
        'total': rede.count(),
        'ativos': rede.filter(situacao=SituacaoMembro.ATIVO).count(),
        'titulados': rede.filter(
            titulacao__codigo__in=TITULACOES_DE_MESTRE_OU_DOUTOR
        ).count(),
        'sem_competencia': rede.exclude(
            vinculos_competencia__competencia__tipo=TipoCompetencia.COMPETENCIA
        ).count(),
    }
