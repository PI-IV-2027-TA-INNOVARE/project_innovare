"""
O motor de score do matching (RF06, RF07).

Calculo puro: entra competencia necessaria e perfil, sai score com as features
e os motivos. Nao toca banco nem HTTP - e o que permite testar o ranking sem
subir rede, fila ou provedor (AGENTS.md 1).

**Pesos sao configuracao, nunca numero magico** (AGENTS.md 2.4): os quatro
componentes vem de `AI_MATCH_WEIGHT_*`, o fator de disponibilidade de
`AI_MATCH_DISP_*` e o desconto da competencia desejavel de
`AI_MATCH_PESO_DESEJAVEL`.

**A afinidade com o tema vem da base semantica** (`semantica.BaseSemantica`).
Sem ela - modelo desligado ou fora do ar -, o componente semantico sai da conta
e os pesos restantes sao **renormalizados** - dividir
pelo peso disponivel mantem o score na escala 0..1 e mantem
`AI_MATCH_MIN_SCORE` com o mesmo significado. E o fallback que o AGENTS.md 0.2
nomeia: "embedding indisponivel -> busca lexical". A rodada fica marcada com
`fallback_usado` e o motivo aparece em `match_reasons`, para ninguem ler o
numero como se a base semantica tivesse entrado.
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field
from typing import Protocol, Sequence

from django.conf import settings

from apps.competencies.models import CompetenciaNecessaria, NivelImportancia
from apps.network.models import MembroRede, PapelNaRede, TipoCompetencia

ESTRATEGIA_HIBRIDA = 'hibrido_v1'

PALAVRAS_VAZIAS = frozenset(
    {
        'com', 'para', 'por', 'dos', 'das', 'dao', 'nao', 'uma', 'uns',
        'que', 'aos', 'pela', 'pelo', 'sobre', 'entre', 'como', 'mais',
        'seu', 'sua', 'ser', 'tem', 'the', 'and', 'of',
    }
)

TAMANHO_MINIMO_DO_TERMO = 3
MOTIVOS_DE_COBERTURA = 3


def termos(texto: str) -> set[str]:
    """
    O texto reduzido a termos comparaveis.

    Sem acento e sem caixa porque "Fermentacao" e "fermentação" sao a mesma
    competencia para quem digita, e o perfil e digitado por gente diferente da
    que escreve a proposta.
    """
    if not texto:
        return set()

    normalizado = unicodedata.normalize('NFD', str(texto).lower())
    limpo = ''.join(
        caractere if unicodedata.category(caractere) != 'Mn' else ''
        for caractere in normalizado
    )
    bruto = ''.join(
        caractere if caractere.isalnum() else ' ' for caractere in limpo
    )

    return {
        termo
        for termo in bruto.split()
        if len(termo) >= TAMANHO_MINIMO_DO_TERMO and termo not in PALAVRAS_VAZIAS
    }


def cosseno(a: Sequence[float], b: Sequence[float]) -> float:
    """
    Similaridade de cosseno em Python puro, limitada a 0..1.

    Sem `pgvector` e sem `numpy` de proposito (plano 8.3): a rede interna e
    fechada e a varredura sobre dezenas de vetores custa menos que o indice.
    """
    if not a or not b or len(a) != len(b):
        return 0.0

    produto = sum(x * y for x, y in zip(a, b))
    norma_a = sum(x * x for x in a) ** 0.5
    norma_b = sum(y * y for y in b) ** 0.5

    if not norma_a or not norma_b:
        return 0.0

    return max(0.0, min(1.0, produto / (norma_a * norma_b)))


class ProvedorDeEmbedding(Protocol):
    """
    Contrato da base semantica que o motor consulta.

    `preparar` garante os vetores da rodada antes do calculo; depois, os dois
    `vetor_*` so leem. Quem implementa e `semantica.BaseSemantica`.
    """

    @property
    def disponivel(self) -> bool:
        ...

    @property
    def modelo(self) -> str:
        ...

    def preparar(
        self,
        competencias: Sequence[CompetenciaNecessaria],
        candidatos: Sequence[Candidato],
    ) -> dict[str, int]:
        ...

    def vetor_do_candidato(self, candidato: Candidato) -> Sequence[float] | None:
        ...

    def vetor_da_competencia(
        self, competencia: CompetenciaNecessaria
    ) -> Sequence[float] | None:
        ...


class EmbeddingIndisponivel:
    """
    O provedor que declara ausencia.

    Existe para a ausencia ser explicita no codigo e no score, em vez de um
    `if` escondido no meio do calculo.
    """

    disponivel = False
    modelo = ''

    def preparar(self, competencias, candidatos) -> dict[str, int]:
        return {'calculados': 0, 'reaproveitados': 0}

    def vetor_do_candidato(self, candidato) -> None:
        return None

    def vetor_da_competencia(self, competencia) -> None:
        return None


@dataclass
class Candidato:
    """Um perfil da rede, achatado para o calculo."""

    membro: MembroRede
    competencias: list[str] = field(default_factory=list)
    tecnicas: list[str] = field(default_factory=list)
    linhas: list[str] = field(default_factory=list)

    @property
    def nome(self) -> str:
        return self.membro.nome

    @property
    def nivel_titulacao(self) -> int:
        return self.membro.titulacao.nivel if self.membro.titulacao_id else 0

    @property
    def papel_sugerido(self) -> str:
        """
        O papel vem da rede, nao de palpite do score.

        Quem e Supervisor na AC2 esta declarado em `papel_rede` (RF02); inferir
        isso do score inventaria hierarquia que o sistema nao decide.
        """
        return self.membro.papel_rede

    def termos_tecnicos(self) -> set[str]:
        reuniao: set[str] = set()

        for nome in self.competencias + self.tecnicas:
            reuniao |= termos(nome)

        return reuniao

    def termos_de_area(self) -> set[str]:
        reuniao = termos(self.membro.experiencia)

        for nome in self.linhas:
            reuniao |= termos(nome)

        return reuniao

    def ids_de_competencia(self) -> set[int]:
        return {
            vinculo.competencia_id for vinculo in self.membro.vinculos_competencia.all()
        }


@dataclass
class Avaliacao:
    """O resultado por candidato - score, features, motivos e cobertura."""

    candidato: Candidato
    score: float
    features: dict[str, float | None]
    motivos: list[str]
    cobertura: dict[int, float]

    @property
    def membro(self) -> MembroRede:
        return self.candidato.membro


class MotorDeMatching:
    """O calculo do score hibrido, com pesos de configuracao."""

    def __init__(self, provedor_embedding: ProvedorDeEmbedding | None = None) -> None:
        self._embedding = provedor_embedding or EmbeddingIndisponivel()
        self.pesos = {
            'semantico': float(settings.AI_MATCH_WEIGHT_SEMANTIC),
            'lexical': float(settings.AI_MATCH_WEIGHT_LEXICAL),
            'area': float(settings.AI_MATCH_WEIGHT_AREA),
            'disponibilidade': float(settings.AI_MATCH_WEIGHT_AVAILABILITY),
        }
        self.peso_desejavel = float(settings.AI_MATCH_PESO_DESEJAVEL)
        self.fatores_disponibilidade = dict(settings.AI_MATCH_FATOR_DISPONIBILIDADE)

    @property
    def estrategia(self) -> str:
        return ESTRATEGIA_HIBRIDA

    @property
    def semantico_disponivel(self) -> bool:
        return bool(self._embedding.disponivel)

    @property
    def modelo_semantico(self) -> str:
        return self._embedding.modelo if self.semantico_disponivel else ''

    def _peso_da_competencia(self, competencia: CompetenciaNecessaria) -> float:
        if competencia.nivel_importancia == NivelImportancia.DESEJAVEL:
            return self.peso_desejavel

        return 1.0

    def _cobertura(
        self, competencia: CompetenciaNecessaria, universo: set[str]
    ) -> float:
        """
        Quanto dos termos da competencia necessaria o perfil cobre.

        Divide pelos termos da *competencia*, nao pela uniao: perfil extenso
        nao pode diluir a cobertura de quem pede uma coisa so.
        """
        pedidos = termos(competencia.descricao)

        if not pedidos:
            return 0.0

        return len(pedidos & universo) / len(pedidos)

    def avaliar(
        self,
        competencias: Sequence[CompetenciaNecessaria],
        candidatos: Sequence[Candidato],
    ) -> list[Avaliacao]:
        """As avaliacoes, da maior para a menor, com empate resolvido por titulacao."""
        self._embedding.preparar(competencias, candidatos)

        avaliacoes = [
            self._avaliar_candidato(competencias, candidato)
            for candidato in candidatos
        ]

        avaliacoes.sort(
            key=lambda avaliacao: (
                -avaliacao.score,
                -avaliacao.candidato.nivel_titulacao,
                avaliacao.candidato.nome,
            )
        )
        return avaliacoes

    def _avaliar_candidato(
        self,
        competencias: Sequence[CompetenciaNecessaria],
        candidato: Candidato,
    ) -> Avaliacao:
        tecnicos = candidato.termos_tecnicos()
        de_area = candidato.termos_de_area()
        ids_do_perfil = candidato.ids_de_competencia()

        peso_total = 0.0
        soma_lexical = 0.0
        soma_area = 0.0
        cobertura: dict[int, float] = {}
        melhores: list[tuple[float, str]] = []

        for competencia in competencias:
            peso = self._peso_da_competencia(competencia)
            peso_total += peso

            if (
                competencia.competencia_id
                and competencia.competencia_id in ids_do_perfil
            ):
                lexical = 1.0
            else:
                lexical = self._cobertura(competencia, tecnicos)

            area = self._cobertura(competencia, de_area)

            soma_lexical += peso * lexical
            soma_area += peso * area
            cobertura[competencia.id_competencia_necessaria] = max(lexical, area)
            melhores.append((lexical, competencia.descricao))

        componentes: dict[str, float | None] = {
            'semantico': None,
            'lexical': (soma_lexical / peso_total) if peso_total else 0.0,
            'area': (soma_area / peso_total) if peso_total else 0.0,
            'disponibilidade': self.fatores_disponibilidade.get(
                candidato.membro.disponibilidade, 0.0
            ),
        }

        if self.semantico_disponivel:
            componentes['semantico'] = self._embedding_score(competencias, candidato)

        score = self._combinar(componentes)

        return Avaliacao(
            candidato=candidato,
            score=score,
            features={
                nome: (round(valor, 4) if valor is not None else None)
                for nome, valor in componentes.items()
            },
            motivos=self._motivos(candidato, componentes, melhores),
            cobertura=cobertura,
        )

    def _embedding_score(
        self,
        competencias: Sequence[CompetenciaNecessaria],
        candidato: Candidato,
    ) -> float | None:
        """
        A afinidade com o tema: o cosseno entre o perfil e cada competencia.

        `None` quando falta o vetor do perfil ou de todas as competencias - a
        parcela sai da conta em vez de entrar como zero.
        """
        perfil = self._embedding.vetor_do_candidato(candidato)

        if perfil is None:
            return None

        peso_total = 0.0
        soma = 0.0

        for competencia in competencias:
            vetor = self._embedding.vetor_da_competencia(competencia)

            if vetor is None:
                continue

            peso = self._peso_da_competencia(competencia)
            peso_total += peso
            soma += peso * cosseno(vetor, perfil)

        return (soma / peso_total) if peso_total else None

    def _combinar(self, componentes: dict[str, float | None]) -> float:
        disponivel = {
            nome: valor for nome, valor in componentes.items() if valor is not None
        }
        peso_disponivel = sum(self.pesos[nome] for nome in disponivel)

        if not peso_disponivel:
            return 0.0

        bruto = sum(self.pesos[nome] * valor for nome, valor in disponivel.items())

        return round(bruto / peso_disponivel, 4)

    def _motivos(
        self,
        candidato: Candidato,
        componentes: dict[str, float | None],
        melhores: list[tuple[float, str]],
    ) -> list[str]:
        """
        A Justificativa do Matching em linguagem de gente (RF06, glossario).

        Sem isto a sugestao e um numero, e o Supervisor nao tem como validar
        nem recusar com fundamento.
        """
        motivos = []

        for cobertura, descricao in sorted(melhores, reverse=True)[
            :MOTIVOS_DE_COBERTURA
        ]:
            if cobertura <= 0:
                continue

            motivos.append(
                f'Competência "{descricao}" coberta pelo perfil '
                f'({cobertura:.0%}).'
            )

        if candidato.membro.titulacao_id:
            motivos.append(f'Titulação: {candidato.membro.titulacao.rotulo}.')

        motivos.append(
            f'Disponibilidade declarada: '
            f'{candidato.membro.get_disponibilidade_display()}.'
        )

        if candidato.papel_sugerido == PapelNaRede.SUPERVISOR:
            motivos.append('Integra a rede como Supervisor.')

        if componentes['semantico'] is None:
            motivos.append(
                'Afinidade com o tema indisponível nesta rodada: a nota usa '
                'palavras em comum, área de atuação e disponibilidade.'
            )
        else:
            motivos.append(
                f'Afinidade com o tema da oportunidade: {componentes["semantico"]:.0%}.'
            )

        return motivos


def candidato_de(membro: MembroRede) -> Candidato:
    """O perfil achatado, com as tres listas que a UI mostra separadas."""
    por_tipo: dict[str, list[str]] = {
        TipoCompetencia.COMPETENCIA: [],
        TipoCompetencia.TECNICA: [],
        TipoCompetencia.LINHA_PESQUISA: [],
    }

    for vinculo in membro.vinculos_competencia.all():
        destino = por_tipo.get(vinculo.competencia.tipo)

        if destino is not None:
            destino.append(vinculo.competencia.nome)

    return Candidato(
        membro=membro,
        competencias=por_tipo[TipoCompetencia.COMPETENCIA],
        tecnicas=por_tipo[TipoCompetencia.TECNICA],
        linhas=por_tipo[TipoCompetencia.LINHA_PESQUISA],
    )
