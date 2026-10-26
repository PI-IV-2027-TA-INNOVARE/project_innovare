"""
Casos de uso do Matching e da Equipe Potencial (RF06, RF07, RF08 / EP05).

O que sai daqui e **sugestao**: nao ha convite, aceite nem recusa (RN-A06 /
D07). Quem decide a composicao e o Supervisor, e a decisao dele fica gravada em
`validada` / `ajustado_por`.

Rastreabilidade (AGENTS.md 4.4): cada rodada e uma linha de `ExecucaoMatching`
com os pesos usados, a estrategia, se houve rerank e se houve fallback; cada
indicacao carrega `match_reasons` e `score_features`. "Por que esta pessoa
apareceu na semana passada e sumiu hoje" tem resposta.

O rerank do Gemini **reordena**, nao substitui o score: o numero que vai para a
tela continua sendo o do motor configurado (`AI_MATCH_WEIGHT_*`), e a ordem
passa a refletir a leitura do provedor. Trocar o score pelo da IA jogaria no
lixo os pesos que o PO ratificou.
"""
from __future__ import annotations

import uuid
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Usuario
from apps.ai.models import StatusExecucao
from apps.ai.services.apelidos import Apelidos
from apps.ai.services.protocolos import ProvedorDeIA
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.competencies.models import CompetenciaNecessaria
from apps.copilot.services.proposta import proposta_de
from apps.matching.models import (
    EquipePotencial,
    ExecucaoMatching,
    LacunaCompetenciaEquipe,
    MembroEquipe,
    OrigemIndicacao,
)
from apps.matching.services.motor import Avaliacao, MotorDeMatching, candidato_de
from apps.matching.services.semantica import BaseSemantica, provedor_de_embedding
from apps.network.models import MembroRede, SituacaoMembro
from apps.opportunities.models import Oportunidade
from core.exceptions import ConflitoDeEstado, RecursoNaoEncontrado


def candidatos_da_rede():
    """
    A rede interna elegivel.

    Inativo fica fora; `sem_acesso` entra, porque a RN-A04 permite indicar quem
    o Supervisor acabou de cadastrar e ainda nao liberou - exigir conta
    excluiria justamente o cadastro novo.
    """
    return (
        MembroRede.objects.com_identificacao()
        .exclude(situacao=SituacaoMembro.INATIVO)
        .select_related('titulacao')
        .prefetch_related('vinculos_competencia__competencia', 'formacoes__titulacao')
        .order_by('nome_atual')
    )


def equipe_atual_de(oportunidade: Oportunidade) -> EquipePotencial:
    """A ultima equipe gerada, ou o 404 que a tela usa para oferecer o matching."""
    equipe = (
        oportunidade.equipes_potenciais.select_related('execucao')
        .prefetch_related(
            'membros__membro__titulacao', 'membros__membro__usuario', 'lacunas'
        )
        .first()
    )

    if equipe is None:
        raise RecursoNaoEncontrado(
            'Esta oportunidade ainda não tem equipe potencial.',
            'equipe_inexistente',
        )

    return equipe


def membro_da_equipe(equipe: EquipePotencial, identificador: int) -> MembroEquipe:
    membro = equipe.membros.filter(id_membro_equipe=identificador).first()

    if membro is None:
        raise RecursoNaoEncontrado(
            'Pessoa não encontrada nesta equipe potencial.', 'membro_inexistente'
        )

    return membro


class ExecutarMatchingService:
    """Uma rodada de matching sobre as competencias necessarias (RF06, RF07)."""

    def __init__(
        self,
        provedor: ProvedorDeIA | None = None,
        motor: MotorDeMatching | None = None,
    ) -> None:
        self._provedor = provedor
        self._motor = motor

    def _resolver_provedor(self):
        if self._provedor is not None:
            return self._provedor

        from apps.ai.services.gemini_service import ProvedorGemini

        return ProvedorGemini()

    def execute(
        self, *, oportunidade: Oportunidade, ator: Usuario
    ) -> dict[str, Any]:
        """
        O motor e o rerank rodam antes da transacao, que so abre para gravar:
        o rerank chama o provedor externo, e dentro de `atomic` prenderia a
        conexao do banco durante a espera.
        """
        proposta = proposta_de(oportunidade)
        necessarias = list(proposta.competencias_necessarias.select_related('competencia'))

        if not necessarias:
            raise ConflitoDeEstado(
                'Derive as competências necessárias antes de rodar o matching.',
                'sem_competencias',
            )

        candidatos = [candidato_de(membro) for membro in candidatos_da_rede()]

        if not candidatos:
            raise ConflitoDeEstado(
                'Não há pessoas ativas na rede interna para comparar.',
                'rede_vazia',
            )

        motor = self._motor or MotorDeMatching(BaseSemantica(provedor_de_embedding()))
        avaliacoes = motor.avaliar(necessarias, candidatos)
        sem_semantica = not motor.semantico_disponivel

        selecionadas = [
            avaliacao
            for avaliacao in avaliacoes
            if avaliacao.score >= float(settings.AI_MATCH_MIN_SCORE)
        ][: int(settings.AI_MATCH_LIMITE_SUGESTOES)]

        rerank = self._reordenar(
            oportunidade=oportunidade,
            necessarias=necessarias,
            selecionadas=selecionadas,
            ator=ator,
        )
        selecionadas = rerank['selecionadas']

        with transaction.atomic():
            execucao = ExecucaoMatching.objects.create(
                oportunidade=oportunidade,
                estrategia=motor.estrategia,
                pesos=self._pesos_registrados(motor),
                versao_modelo='',
                executado_por=ator.email,
                status=StatusExecucao.EXECUTANDO,
                fallback_usado=sem_semantica,
            )

            equipe = EquipePotencial.objects.create(
                oportunidade=oportunidade, execucao=execucao
            )

            for avaliacao in selecionadas:
                MembroEquipe.objects.create(
                    equipe=equipe,
                    membro=avaliacao.membro,
                    papel=avaliacao.candidato.papel_sugerido,
                    score_compatibilidade=avaliacao.score,
                    justificativa=' '.join(avaliacao.motivos),
                    match_reasons=avaliacao.motivos,
                    score_features=avaliacao.features,
                    origem=OrigemIndicacao.IA,
                )

            lacunas = self._registrar_lacunas(
                equipe=equipe, necessarias=necessarias, selecionadas=selecionadas
            )

            execucao.status = StatusExecucao.OK
            execucao.usou_rerank = rerank['usou_rerank']
            execucao.versao_modelo = rerank['versao_modelo']
            execucao.execucao_ia = rerank['execucao_ia']
            execucao.concluido_em = timezone.now()
            execucao.save(
                update_fields=[
                    'status',
                    'usou_rerank',
                    'versao_modelo',
                    'execucao_ia',
                    'concluido_em',
                ]
            )

            registrar_evento(
                categoria=CategoriaEvento.MATCHING,
                tipo='execucao',
                entidade='equipe_potencial',
                entidade_id=equipe.id_equipe,
                oportunidade=oportunidade,
                ator=ator.email,
                execucao_ia=rerank['execucao_ia'],
                detalhe={
                    'candidatos': len(candidatos),
                    'sugeridos': len(selecionadas),
                    'lacunas': len(lacunas),
                    'estrategia': motor.estrategia,
                    'pesos': self._pesos_registrados(motor),
                    'score_minimo': float(settings.AI_MATCH_MIN_SCORE),
                    'semantico_disponivel': not sem_semantica,
                    'usou_rerank': rerank['usou_rerank'],
                },
            )

            return {
                'equipe': equipe,
                'execucao': execucao,
                'avaliados': len(candidatos),
                'lacunas': lacunas,
            }

    def _pesos_registrados(self, motor: MotorDeMatching) -> dict[str, Any]:
        """
        Os pesos *da rodada*, nao os do arquivo de hoje.

        Guardar isto e o que permite reler um matching de outubro depois de o
        PO mexer nos pesos em novembro.
        """
        return {
            'componentes': motor.pesos,
            'desejavel': motor.peso_desejavel,
            'disponibilidade': motor.fatores_disponibilidade,
            'semantico_disponivel': motor.semantico_disponivel,
            'modelo_semantico': motor.modelo_semantico,
        }

    def _reordenar(
        self,
        *,
        oportunidade: Oportunidade,
        necessarias: list[CompetenciaNecessaria],
        selecionadas: list[Avaliacao],
        ator: Usuario,
    ) -> dict[str, Any]:
        """
        O rerank opcional do Gemini.

        Desligado (`AI_MATCH_RERANK_ENABLED=False`) ou sem chave, devolve a
        ordem do motor - o fallback seguro do AGENTS.md 0.2. Em teste, a settings
        forca o desligamento (AGENTS.md 0.1).
        """
        vazio = {
            'selecionadas': selecionadas,
            'usou_rerank': False,
            'versao_modelo': '',
            'execucao_ia': None,
        }

        if not settings.AI_MATCH_RERANK_ENABLED or not selecionadas:
            return vazio

        provedor = self._resolver_provedor()

        if not getattr(provedor, 'disponivel', False):
            return vazio

        from apps.matching.serializers import SaidaMatchingSerializer

        apelidos = Apelidos([avaliacao.candidato.nome for avaliacao in selecionadas])

        resultado = provedor.executar_matching(
            oportunidade_id=oportunidade.id_oportunidade,
            competencias_necessarias=[
                {
                    'descricao': competencia.descricao,
                    'nivel_importancia': competencia.nivel_importancia,
                }
                for competencia in necessarias
            ],
            candidatos=[
                {
                    'apelido': apelidos.apelido(avaliacao.candidato.nome),
                    'titulacao': (
                        avaliacao.membro.titulacao.rotulo
                        if avaliacao.membro.titulacao_id
                        else 'N/A'
                    ),
                    'disponibilidade': avaliacao.membro.get_disponibilidade_display(),
                    'competencias': avaliacao.candidato.competencias,
                    'tecnicas': avaliacao.candidato.tecnicas,
                    'linhas': avaliacao.candidato.linhas,
                    'experiencia': apelidos.anonimizar(avaliacao.membro.experiencia),
                }
                for avaliacao in selecionadas
            ],
            correlation_id=uuid.uuid4(),
            executado_por=ator.email,
        )

        saida = SaidaMatchingSerializer(
            data=apelidos.restaurar_em(resultado.get('dados') or {})
        )

        if resultado.get('fallback_usado') or not saida.is_valid():
            return {
                **vazio,
                'execucao_ia': resultado.get('execucao_ia'),
            }

        posicao = {}

        for ordem, item in enumerate(saida.validated_data.get('matches', [])):
            indice = item.get('candidato_index')

            if indice is None or not 0 <= indice < len(selecionadas):
                continue

            posicao[indice] = ordem
            motivos = item.get('match_reasons') or []

            if motivos:
                selecionadas[indice].motivos = selecionadas[indice].motivos + [
                    f'Segundo a IA: {motivo}' for motivo in motivos
                ]

        if not posicao:
            return {**vazio, 'execucao_ia': resultado.get('execucao_ia')}

        ordenadas = sorted(
            range(len(selecionadas)),
            key=lambda indice: (posicao.get(indice, len(selecionadas)), indice),
        )

        return {
            'selecionadas': [selecionadas[indice] for indice in ordenadas],
            'usou_rerank': True,
            'versao_modelo': settings.AI_MATCH_GEMINI_MODEL,
            'execucao_ia': resultado.get('execucao_ia'),
        }

    def _registrar_lacunas(
        self,
        *,
        equipe: EquipePotencial,
        necessarias: list[CompetenciaNecessaria],
        selecionadas: list[Avaliacao],
    ) -> list[LacunaCompetenciaEquipe]:
        """
        A competencia que a equipe sugerida nao cobre (RF08).

        Cobertura e a melhor entre as pessoas sugeridas: competencia coberta por
        uma pessoa nao e lacuna da equipe, mesmo que as outras nao a tenham.
        """
        minimo = float(settings.AI_MATCH_COBERTURA_MINIMA)
        lacunas = []

        for competencia in necessarias:
            melhor = max(
                (
                    avaliacao.cobertura.get(
                        competencia.id_competencia_necessaria, 0.0
                    )
                    for avaliacao in selecionadas
                ),
                default=0.0,
            )

            if melhor >= minimo:
                continue

            lacunas.append(
                LacunaCompetenciaEquipe.objects.create(
                    equipe=equipe,
                    competencia_necessaria=competencia,
                    descricao=(
                        f'Nenhuma pessoa sugerida cobre "{competencia.descricao}" '
                        f'de forma suficiente (melhor cobertura: {melhor:.0%}).'
                    ),
                )
            )

        return lacunas


class AjustarMembroService:
    """
    O ajuste humano da equipe sugerida (RF08 / PB47).

    `incluido` e o que o Supervisor mexe: tirar alguem da composicao nao apaga a
    indicacao, porque a rodada que a produziu precisa continuar legivel.
    """

    @transaction.atomic
    def execute(
        self, *, membro: MembroEquipe, dados: dict[str, Any], ator: Usuario
    ) -> MembroEquipe:
        for campo, valor in dados.items():
            setattr(membro, campo, valor)

        membro.ajustado_por = ator
        membro.save()

        registrar_evento(
            categoria=CategoriaEvento.MATCHING,
            tipo='membro_ajustado',
            entidade='membro_equipe',
            entidade_id=membro.id_membro_equipe,
            oportunidade=membro.equipe.oportunidade,
            ator=ator.email,
            detalhe={'campos': sorted(dados), 'incluido': membro.incluido},
        )
        return membro


class AdicionarMembroService:
    """A pessoa que o Supervisor acrescenta a mao (RF08 / PB47)."""

    @transaction.atomic
    def execute(
        self,
        *,
        equipe: EquipePotencial,
        membro_rede: MembroRede,
        papel: str,
        ator: Usuario,
    ) -> MembroEquipe:
        if equipe.membros.filter(membro=membro_rede).exists():
            raise ConflitoDeEstado(
                'Esta pessoa já consta da equipe potencial.', 'membro_duplicado'
            )

        membro = MembroEquipe.objects.create(
            equipe=equipe,
            membro=membro_rede,
            papel=papel,
            score_compatibilidade=None,
            justificativa='Incluída pelo Supervisor.',
            match_reasons=['Inclusão manual do Supervisor.'],
            score_features={},
            origem=OrigemIndicacao.MANUAL,
            ajustado_por=ator,
        )

        registrar_evento(
            categoria=CategoriaEvento.MATCHING,
            tipo='membro_adicionado',
            entidade='membro_equipe',
            entidade_id=membro.id_membro_equipe,
            oportunidade=equipe.oportunidade,
            ator=ator.email,
            detalhe={'id_membro': membro_rede.id_membro, 'papel': papel},
        )
        return membro


class ValidarEquipeService:
    """
    O registro de que o Supervisor validou a composicao (RF08 / D07).

    Validar nao convoca ninguem: marca que a equipe potencial foi revisada por
    quem conduz a oportunidade.
    """

    @transaction.atomic
    def execute(
        self, *, equipe: EquipePotencial, ator: Usuario
    ) -> EquipePotencial:
        incluidos = equipe.membros.filter(incluido=True)

        if not incluidos.exists():
            raise ConflitoDeEstado(
                'A equipe potencial está vazia: inclua ao menos uma pessoa.',
                'equipe_vazia',
            )

        incluidos.update(validada=True, ajustado_por=ator)

        registrar_evento(
            categoria=CategoriaEvento.MATCHING,
            tipo='equipe_validada',
            entidade='equipe_potencial',
            entidade_id=equipe.id_equipe,
            oportunidade=equipe.oportunidade,
            ator=ator.email,
            detalhe={'membros': incluidos.count()},
        )
        return equipe
