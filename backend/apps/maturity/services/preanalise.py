"""
Casos de uso da Pre-analise de Maturidade PIPE/FAPESP (RF09, RF10 / EP06).

Tres limites que a baseline impoe e o codigo respeita:

1. **O resultado e orientativo.** Nao ha nota, parecer, aprovacao nem decisao
   da FAPESP - nem na coluna, nem no texto, nem no vocabulario (AGENTS.md 0.2,
   `CONTEXT.md` secao 4).
2. **Criterio nao e inventado.** Os criterios vem da Base de Conhecimento PIPE
   (`IA/Colinha_IA_PIPE_*.json`, baseline `PIPE_JT_F1_2026_R1_V2`) e precisam
   estar *cadastrados e vigentes* para a pre-analise rodar. Sem versao vigente,
   a operacao recusa e explica - preferivel a analisar contra critério que
   ninguem ratificou (P4).
3. **Sem IA nao ha resultado simulado.** Provedor indisponivel grava a execucao
   com erro e nenhuma dimensao. Uma saida fabricada ensinaria o Supervisor a ler
   um relatorio que o modulo real nao produz do mesmo jeito.

A reavaliacao do RF10 e uma nova linha de `PreAnalise`: a anterior fica, com a
versao de criterios e a versao da proposta que ela avaliou.
"""
from __future__ import annotations

import uuid
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Usuario
from apps.ai.services.base_conhecimento import base_conhecimento
from apps.ai.services.protocolos import ProvedorDeIA
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.competencies.services.derivacao import texto_da_proposta
from apps.copilot.models import Lacuna, TipoLacuna
from apps.copilot.services.proposta import proposta_de
from apps.maturity.models import (
    CriterioPreAnalise,
    DimensaoMaturidade,
    NivelDimensao,
    OrigemRecomendacao,
    PreAnalise,
    PreAnaliseDimensao,
    Recomendacao,
)
from apps.ai.models import StatusExecucao
from apps.opportunities.models import Oportunidade
from core.exceptions import ConflitoDeEstado, RecursoNaoEncontrado

DIMENSAO_DO_CRITERIO = {
    'A1': DimensaoMaturidade.PLANO_PESQUISA,
    'A2': DimensaoMaturidade.PLANO_PESQUISA,
    'A3': DimensaoMaturidade.PLANO_PESQUISA,
    'A4': DimensaoMaturidade.DESAFIO_TECNOLOGICO,
    'A5': DimensaoMaturidade.VIABILIDADE,
    'A6': DimensaoMaturidade.INOVACAO,
    'B1': DimensaoMaturidade.EQUIPE_SUPERVISAO,
    'B2': DimensaoMaturidade.EQUIPE_SUPERVISAO,
    'B3': DimensaoMaturidade.EQUIPE_SUPERVISAO,
    'C1': DimensaoMaturidade.INOVACAO,
    'C2': DimensaoMaturidade.INOVACAO,
    'C3': DimensaoMaturidade.VIABILIDADE,
    'C4': DimensaoMaturidade.VIABILIDADE,
    'D1': DimensaoMaturidade.EQUIPE_SUPERVISAO,
    'D2': DimensaoMaturidade.EQUIPE_SUPERVISAO,
    'D3': DimensaoMaturidade.EQUIPE_SUPERVISAO,
    'D4': DimensaoMaturidade.EQUIPE_SUPERVISAO,
    'E1': DimensaoMaturidade.VIABILIDADE,
    'E2': DimensaoMaturidade.VIABILIDADE,
    'E3': DimensaoMaturidade.VIABILIDADE,
    'F1': DimensaoMaturidade.INFRAESTRUTURA,
    'F2': DimensaoMaturidade.EQUIPE_SUPERVISAO,
    'F3': DimensaoMaturidade.VIABILIDADE,
}
"""
Dos 23 criterios da chamada para as 6 dimensoes do glossario.

As duas listas vem de baselines diferentes - os criterios da Base de
Conhecimento PIPE, as dimensoes da Declaracao de Escopo - e ninguem publicou a
correspondencia. Esta e **provisoria e esta na pauta do PO (P4)**: mudar uma
linha aqui muda sob qual dimensao o criterio aparece no relatorio, nao o que o
sistema faz.
"""

ORDEM_DAS_DIMENSOES = [
    DimensaoMaturidade.DESAFIO_TECNOLOGICO,
    DimensaoMaturidade.INOVACAO,
    DimensaoMaturidade.PLANO_PESQUISA,
    DimensaoMaturidade.EQUIPE_SUPERVISAO,
    DimensaoMaturidade.INFRAESTRUTURA,
    DimensaoMaturidade.VIABILIDADE,
]

SEM_EQUIPE = 'Equipe potencial ainda não gerada para esta oportunidade.'


def criterios_vigentes():
    """Os criterios sem data de encerramento - a versao em uso hoje."""
    return CriterioPreAnalise.objects.filter(vigente_ate__isnull=True).order_by(
        'dimensao', 'codigo'
    )


def versao_vigente() -> str:
    """
    A versao de criterios que a pre-analise vai citar.

    Recusa em vez de assumir: analisar sem criterio cadastrado produziria um
    relatorio que ninguem consegue reproduzir depois.
    """
    primeiro = criterios_vigentes().first()

    if primeiro is None:
        raise ConflitoDeEstado(
            'Nenhuma versão de critérios da pré-análise está cadastrada. '
            'Importe a baseline em Console › Parâmetros antes de analisar.',
            'criterios_ausentes',
        )

    return primeiro.versao


def preanalise_atual_de(oportunidade: Oportunidade) -> PreAnalise:
    """A ultima pre-analise da proposta, ou o 404 que a tela usa para oferecer a 1a."""
    proposta = proposta_de(oportunidade)
    analise = (
        proposta.pre_analises.prefetch_related(
            'dimensoes', 'lacunas', 'recomendacoes'
        ).first()
    )

    if analise is None:
        raise RecursoNaoEncontrado(
            'Esta oportunidade ainda não tem pré-análise.',
            'preanalise_inexistente',
        )

    return analise


ORDEM_DO_NIVEL = {
    NivelDimensao.FRAGIL: 0,
    NivelDimensao.EM_DESENVOLVIMENTO: 1,
    NivelDimensao.CONSOLIDADA: 2,
}


def _movimento(anterior: str | None, atual: str | None) -> str:
    if anterior is None:
        return 'nova'

    if atual is None:
        return 'sem_avaliacao'

    diferenca = ORDEM_DO_NIVEL[atual] - ORDEM_DO_NIVEL[anterior]

    if diferenca > 0:
        return 'avancou'

    return 'recuou' if diferenca < 0 else 'manteve'


def comparacao_com_anterior(analise: PreAnalise) -> dict[str, Any] | None:
    """
    A evolucao em relacao a rodada anterior (PB59 / RF10).

    A referencia e a ultima rodada **concluida** antes desta: uma execucao que
    falhou nao tem dimensao nenhuma, e compara-la faria toda dimensao parecer
    nova. Sem rodada concluida antes - ou com esta falha - nao ha comparacao.
    """
    if analise.status != StatusExecucao.OK:
        return None

    anterior = (
        PreAnalise.objects.filter(
            proposta_id=analise.proposta_id,
            status=StatusExecucao.OK,
            executada_em__lt=analise.executada_em,
        )
        .prefetch_related('dimensoes', 'lacunas')
        .first()
    )

    if anterior is None:
        return None

    niveis_antes = {item.dimensao: item.nivel for item in anterior.dimensoes.all()}
    niveis_agora = {item.dimensao: item.nivel for item in analise.dimensoes.all()}

    dimensoes = [
        {
            'dimensao': dimensao.value,
            'dimensao_rotulo': dimensao.label,
            'nivel_anterior': niveis_antes.get(dimensao.value),
            'nivel_atual': niveis_agora.get(dimensao.value),
            'movimento': _movimento(
                niveis_antes.get(dimensao.value), niveis_agora.get(dimensao.value)
            ),
        }
        for dimensao in DimensaoMaturidade
        if dimensao.value in niveis_antes or dimensao.value in niveis_agora
    ]

    return {
        'anterior': {
            'id_pre_analise': anterior.id_pre_analise,
            'executada_em': anterior.executada_em,
            'versao_proposta': anterior.versao_proposta,
            'versao_criterios': anterior.versao_criterios,
        },
        'mesmos_criterios': anterior.versao_criterios == analise.versao_criterios,
        'dimensoes': dimensoes,
        'lacunas': {
            'anterior': len(anterior.lacunas.all()),
            'atual': len(analise.lacunas.all()),
        },
    }


def _texto_da_equipe(oportunidade: Oportunidade) -> str:
    equipe = oportunidade.equipes_potenciais.prefetch_related(
        'membros__membro__titulacao'
    ).first()

    if equipe is None:
        return SEM_EQUIPE

    linhas = []

    for membro in equipe.membros.all():
        if not membro.incluido:
            continue

        titulacao = (
            membro.membro.titulacao.rotulo if membro.membro.titulacao_id else 'N/A'
        )
        linhas.append(
            f'- {membro.membro.nome} | {membro.get_papel_display()} | '
            f'Titulação: {titulacao} | '
            f'Disponibilidade: {membro.membro.get_disponibilidade_display()}'
        )

    return '\n'.join(linhas) if linhas else SEM_EQUIPE


class ImportarCriteriosService:
    """
    Carrega os criterios da Base de Conhecimento PIPE para o banco.

    E o unico caminho de entrada de criterio no sistema: ninguem digita
    criterio de fomento a mao numa tela. O conteudo e da baseline de IA, e o
    `baseline_id` completo fica no evento - a coluna `versao` cabe 12
    caracteres e guarda o rotulo curto (`V2`).
    """

    @transaction.atomic
    def execute(self, *, ator: Usuario) -> dict[str, Any]:
        base = base_conhecimento()

        if not base.disponivel:
            raise ConflitoDeEstado(
                'A Base de Conhecimento PIPE não está disponível no servidor.',
                'base_indisponivel',
            )

        criterios = base.criterios()

        if not criterios:
            raise ConflitoDeEstado(
                'A Base de Conhecimento PIPE não traz critérios.',
                'base_sem_criterios',
            )

        versao = base.versao
        hoje = timezone.now().date()
        criados = 0
        atualizados = 0
        sem_dimensao = []

        for criterio in criterios:
            codigo = str(criterio.get('id', '')).strip()
            dimensao = DIMENSAO_DO_CRITERIO.get(codigo)

            if not codigo or dimensao is None:
                sem_dimensao.append(codigo)
                continue

            descricao = ' — '.join(
                parte
                for parte in (
                    str(criterio.get('label', '')).strip(),
                    str(criterio.get('evaluation_question', '')).strip(),
                )
                if parte
            )

            registro, nasceu = CriterioPreAnalise.objects.update_or_create(
                versao=versao,
                codigo=codigo,
                defaults={
                    'dimensao': dimensao,
                    'descricao': descricao,
                    'vigente_de': hoje,
                    'vigente_ate': None,
                },
            )

            criados += 1 if nasceu else 0
            atualizados += 0 if nasceu else 1

        CriterioPreAnalise.objects.exclude(versao=versao).filter(
            vigente_ate__isnull=True
        ).update(vigente_ate=hoje)

        registrar_evento(
            categoria=CategoriaEvento.PREANALISE,
            tipo='criterios_importados',
            entidade='criterio_referencia_pipe',
            entidade_id=versao,
            ator=ator.email,
            detalhe={
                'baseline_id': base.baseline_id,
                'versao': versao,
                'criados': criados,
                'atualizados': atualizados,
                'sem_dimensao': sem_dimensao,
            },
        )

        return {
            'versao': versao,
            'baseline_id': base.baseline_id,
            'criados': criados,
            'atualizados': atualizados,
            'sem_dimensao': sem_dimensao,
        }


class PreAnalisarService:
    """Uma execucao da pre-analise (RF09) ou a reavaliacao do RF10."""

    def __init__(self, provedor: ProvedorDeIA | None = None) -> None:
        self._provedor = provedor

    def _resolver_provedor(self):
        if self._provedor is not None:
            return self._provedor

        from apps.ai.services.gemini_service import ProvedorGemini

        return ProvedorGemini()

    def execute(self, *, oportunidade: Oportunidade, ator: Usuario) -> PreAnalise:
        """
        A chamada ao provedor fica fora da transacao, que so abre para gravar
        o resultado: a pre-analise e a chamada mais longa do produto, e dentro
        de `atomic` prendia a conexao do banco durante toda a espera.
        """
        from apps.maturity.serializers import SaidaPreAnaliseSerializer

        proposta = proposta_de(oportunidade)
        versao = versao_vigente()
        texto = texto_da_proposta(proposta)

        if not texto:
            raise ConflitoDeEstado(
                'A proposta estruturada está vazia: não há o que pré-analisar.',
                'proposta_vazia',
            )

        correlation_id = uuid.uuid4()
        resultado = self._resolver_provedor().pre_analise_pipe(
            oportunidade_id=oportunidade.id_oportunidade,
            proposta_texto=texto,
            equipe_texto=_texto_da_equipe(oportunidade),
            correlation_id=correlation_id,
            executado_por=ator.email,
        )

        execucao_ia = resultado.get('execucao_ia')
        fallback_usado = bool(resultado.get('fallback_usado'))
        saida = SaidaPreAnaliseSerializer(data=resultado.get('dados') or {})
        aceita = saida.is_valid()
        dados = dict(saida.validated_data) if aceita else {}
        dimensoes = dados.get('dimensoes', [])

        with transaction.atomic():
            analise = PreAnalise.objects.create(
                proposta=proposta,
                versao_criterios=versao,
                versao_proposta=proposta.versao,
                sintese=dados.get('sintese', ''),
                executada_por=ator.email,
                execucao_ia=execucao_ia,
                status=StatusExecucao.OK if dimensoes else StatusExecucao.ERRO,
                erro='' if dimensoes else self._motivo_da_falha(fallback_usado, aceita),
            )

            self._gravar_dimensoes(analise, dimensoes)
            lacunas = self._gravar_lacunas(
                analise=analise,
                oportunidade=oportunidade,
                itens=dados.get('lacunas', []),
                execucao_ia=execucao_ia,
            )
            recomendacoes = self._gravar_recomendacoes(
                analise=analise,
                oportunidade=oportunidade,
                itens=dados.get('recomendacoes', []),
                execucao_ia=execucao_ia,
            )

            registrar_evento(
                categoria=CategoriaEvento.PREANALISE,
                tipo='execucao',
                entidade='pre_analise_maturidade',
                entidade_id=analise.id_pre_analise,
                oportunidade=oportunidade,
                ator=ator.email,
                correlation_id=correlation_id,
                execucao_ia=execucao_ia,
                detalhe={
                    'versao_criterios': versao,
                    'versao_proposta': proposta.versao,
                    'dimensoes': len(dimensoes),
                    'lacunas': len(lacunas),
                    'recomendacoes': len(recomendacoes),
                    'fallback_usado': fallback_usado,
                    'saida_aceita': aceita,
                },
            )

            return analise

    def _motivo_da_falha(self, fallback_usado: bool, aceita: bool) -> str:
        if fallback_usado:
            return 'provedor_indisponivel'

        return 'saida_invalida' if not aceita else 'sem_dimensoes'

    def _gravar_dimensoes(
        self, analise: PreAnalise, itens: list[dict[str, Any]]
    ) -> None:
        vistas = set()

        for item in itens:
            dimensao = item['dimensao']

            if dimensao in vistas:
                continue

            vistas.add(dimensao)
            PreAnaliseDimensao.objects.create(
                pre_analise=analise,
                dimensao=dimensao,
                avaliacao=item.get('avaliacao', ''),
                nivel=item['nivel'],
                evidencias=item.get('evidencias', []),
                ordem=(
                    ORDEM_DAS_DIMENSOES.index(dimensao)
                    if dimensao in ORDEM_DAS_DIMENSOES
                    else len(ORDEM_DAS_DIMENSOES)
                ),
            )

    def _gravar_lacunas(
        self,
        *,
        analise: PreAnalise,
        oportunidade: Oportunidade,
        itens: list[dict[str, Any]],
        execucao_ia,
    ) -> list[Lacuna]:
        """
        A lacuna da pre-analise, no mesmo lugar da lacuna da proposta.

        `severidade` fica nula: o provedor nao a devolve, e preencher por conta
        propria seria inventar gravidade (AGENTS.md 2.2).
        """
        lacunas = []

        for item in itens:
            lacunas.append(
                Lacuna.objects.create(
                    oportunidade=oportunidade,
                    tipo=TipoLacuna.PRE_ANALISE,
                    campo_afetado=item.get('dimensao', ''),
                    descricao=item['descricao'],
                    pre_analise=analise,
                    execucao_ia=execucao_ia,
                )
            )

        return lacunas

    def _gravar_recomendacoes(
        self,
        *,
        analise: PreAnalise,
        oportunidade: Oportunidade,
        itens: list[str],
        execucao_ia,
    ) -> list[Recomendacao]:
        recomendacoes = []

        for texto in itens:
            if not (texto or '').strip():
                continue

            recomendacoes.append(
                Recomendacao.objects.create(
                    oportunidade=oportunidade,
                    origem=OrigemRecomendacao.PRE_ANALISE,
                    pre_analise=analise,
                    texto=texto,
                    execucao_ia=execucao_ia,
                )
            )

        return recomendacoes


class AcatarRecomendacaoService:
    """
    O registro de que a recomendacao foi acatada (RF10).

    E o par da reavaliacao: sem marcar o que foi feito, a segunda execucao nao
    tem como ser lida como progresso.
    """

    @transaction.atomic
    def execute(
        self, *, recomendacao: Recomendacao, acatada: bool, ator: Usuario
    ) -> Recomendacao:
        recomendacao.acatada = acatada
        recomendacao.acatada_em = timezone.now() if acatada else None
        recomendacao.save(update_fields=['acatada', 'acatada_em'])

        registrar_evento(
            categoria=CategoriaEvento.PREANALISE,
            tipo='recomendacao_acatada' if acatada else 'recomendacao_reaberta',
            entidade='recomendacao_adequacao',
            entidade_id=recomendacao.id_recomendacao,
            oportunidade=recomendacao.oportunidade,
            ator=ator.email,
        )
        return recomendacao


def recomendacao_de(
    oportunidade: Oportunidade, identificador: int
) -> Recomendacao:
    """A recomendacao *desta* oportunidade - o filtro impede editar a de outra."""
    recomendacao = oportunidade.recomendacoes.filter(
        id_recomendacao=identificador
    ).first()

    if recomendacao is None:
        raise RecursoNaoEncontrado(
            'Recomendação não encontrada nesta oportunidade.',
            'recomendacao_inexistente',
        )

    return recomendacao
