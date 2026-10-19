"""
Indicadores essenciais do fluxo (RF14).

Numeros do fluxo, nao business intelligence: quantas oportunidades existem, em
que etapa estao, de onde vieram e como foram decididas. Complemento nao pode
comprometer o fluxo central (CONTEXT.md secao 6), e um painel que respondesse
perguntas de gestao pediria modelagem que o MVP nao tem.

O recorte de leitura e o mesmo da fila - `escopo_de`. Contagem tambem vaza:
o total responde "quantos existem" a quem nao pode abrir nenhum.
"""
from __future__ import annotations

from typing import Any

from django.db.models import Count, Q, QuerySet

from apps.accounts.models import Papel, Usuario
from apps.decisions.models import Decisao, TipoDecisao
from apps.network.models import MembroRede, PapelNaRede
from apps.opportunities.models import (
    Oportunidade,
    OrigemOportunidade,
    SituacaoOportunidade,
)
from apps.opportunities.services.oportunidade import escopo_de

PAPEIS_QUE_CONSULTAM_A_REDE = (Papel.SUPERVISOR, Papel.PESQUISADOR)


def _contagens(
    consulta: QuerySet, eixos: dict[str, tuple[str, Any]]
) -> tuple[int, dict[str, list[dict[str, Any]]]]:
    """
    O total e todos os eixos pedidos, numa consulta so.

    Uma contagem por valor do enum, **incluindo os que deram zero**: uma etapa
    sem ocorrencia sumiria do grafico, e etapa ausente le-se como "nao existe"
    em vez de "ninguem esta nela" - que e o que o Supervisor precisa enxergar.
    A ordem segue a do enum, que e a ordem do fluxo.

    Antes, cada eixo era um `values().annotate()` e cada total um `count()`:
    cinco numeros custavam sete consultas sequenciais, todas repetindo a
    subconsulta de escopo. Um `Count` com `filter` por valor resolve o eixo
    inteiro dentro do mesmo agregado, e o eixo tem tamanho fixo - e `choices`
    de enum. Ver `core/tests/test_orcamento_de_queries.py`.

    O apelido vai por indice, e nao pelo valor do enum: apelido de agregado e
    nome de argumento, e um valor com hifen ou que colidisse com `total`
    quebraria a chamada.
    """
    apelidos = {
        f'{eixo}_{indice}': Count('pk', filter=Q(**{campo: valor}))
        for eixo, (campo, choices) in eixos.items()
        for indice, (valor, _rotulo) in enumerate(choices)
    }

    agregado = consulta.aggregate(total=Count('pk'), **apelidos)

    return agregado['total'], {
        eixo: [
            {
                'valor': valor,
                'rotulo': rotulo,
                'total': agregado[f'{eixo}_{indice}'],
            }
            for indice, (valor, rotulo) in enumerate(choices)
        ]
        for eixo, (_campo, choices) in eixos.items()
    }


def indicadores_de(usuario: Usuario) -> dict[str, Any]:
    """
    O painel do ator, com o escopo do ator.

    `rede` vem `None` para quem nao consulta a rede interna: o tamanho dela e
    informacao interna, e o agregado responderia a pergunta que
    `/api/rede/` nega ao Demandante.

    O `pk__in` refaz a consulta sem os joins de `escopo_de`. O escopo do
    Pesquisador atravessa equipe e membro; agregar direto sobre ele contaria a
    mesma oportunidade uma vez por indicacao. A subconsulta de `pk` desfaz a
    duplicacao antes de a contagem comecar, e por isso ela continua aqui mesmo
    agora que a contagem e um agregado so.
    """
    oportunidades = Oportunidade.objects.filter(
        pk__in=escopo_de(usuario).values('pk')
    )
    decisoes = Decisao.objects.filter(oportunidade__in=oportunidades)

    total_oportunidades, eixos_oportunidade = _contagens(
        oportunidades,
        {
            'situacao': ('situacao', SituacaoOportunidade.choices),
            'origem': ('origem', OrigemOportunidade.choices),
        },
    )
    total_decisoes, eixos_decisao = _contagens(
        decisoes, {'tipo': ('tipo_decisao', TipoDecisao.choices)}
    )

    return {
        'oportunidades': {
            'total': total_oportunidades,
            'por_situacao': eixos_oportunidade['situacao'],
            'por_origem': eixos_oportunidade['origem'],
        },
        'decisoes': {
            'total': total_decisoes,
            'por_tipo': eixos_decisao['tipo'],
        },
        'rede': _rede() if usuario.papel in PAPEIS_QUE_CONSULTAM_A_REDE else None,
    }


def _rede() -> dict[str, Any]:
    total, eixos = _contagens(
        MembroRede.objects.all(),
        {'papel': ('papel_rede', PapelNaRede.choices)},
    )

    return {'total': total, 'por_papel': eixos['papel']}
