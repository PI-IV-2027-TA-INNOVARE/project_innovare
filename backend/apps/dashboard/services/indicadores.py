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

from django.db.models import Count, QuerySet

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


def _contagem(consulta: QuerySet, campo: str, choices) -> list[dict[str, Any]]:
    """
    Uma contagem por valor do enum, **incluindo os que deram zero**.

    O `values().annotate()` so devolve o que existe no banco. Uma etapa sem
    ocorrencia sumiria do grafico, e etapa ausente le-se como "nao existe" em
    vez de "ninguem esta nela" - que e o que o Supervisor precisa enxergar.
    A ordem segue a do enum, que e a ordem do fluxo.
    """
    totais = {
        linha[campo]: linha['total']
        for linha in consulta.values(campo).annotate(total=Count('pk'))
    }

    return [
        {'valor': valor, 'rotulo': rotulo, 'total': totais.get(valor, 0)}
        for valor, rotulo in choices
    ]


def indicadores_de(usuario: Usuario) -> dict[str, Any]:
    """
    O painel do ator, com o escopo do ator.

    `rede` vem `None` para quem nao consulta a rede interna: o tamanho dela e
    informacao interna, e o agregado responderia a pergunta que
    `/api/rede/` nega ao Demandante.

    O `pk__in` refaz a consulta sem os joins de `escopo_de`. O escopo do
    Pesquisador atravessa equipe e membro; agregar sobre ele contaria a mesma
    oportunidade uma vez por indicacao, e o `distinct()` nao sobrevive ao
    `values().annotate()`.
    """
    oportunidades = Oportunidade.objects.filter(
        pk__in=escopo_de(usuario).values('pk')
    )
    decisoes = Decisao.objects.filter(oportunidade__in=oportunidades)

    return {
        'oportunidades': {
            'total': oportunidades.count(),
            'por_situacao': _contagem(
                oportunidades, 'situacao', SituacaoOportunidade.choices
            ),
            'por_origem': _contagem(
                oportunidades, 'origem', OrigemOportunidade.choices
            ),
        },
        'decisoes': {
            'total': decisoes.count(),
            'por_tipo': _contagem(decisoes, 'tipo_decisao', TipoDecisao.choices),
        },
        'rede': _rede() if usuario.papel in PAPEIS_QUE_CONSULTAM_A_REDE else None,
    }


def _rede() -> dict[str, Any]:
    membros = MembroRede.objects.all()

    return {
        'total': membros.count(),
        'por_papel': _contagem(membros, 'papel_rede', PapelNaRede.choices),
    }
