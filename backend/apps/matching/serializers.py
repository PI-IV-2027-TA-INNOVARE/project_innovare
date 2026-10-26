"""
Contrato do Matching e da Equipe Potencial (RF06, RF07, RF08).

Ausencia deliberada: nao existe campo de aceite, recusa ou convite - nem de
leitura, nem de escrita (RN-A06 / D07). O que o Supervisor escreve e `incluido`,
`papel` e a validacao.
"""
from rest_framework import serializers

from apps.competencies.models import NivelImportancia
from apps.matching.models import (
    EquipePotencial,
    ExecucaoMatching,
    LacunaCompetenciaEquipe,
    MembroEquipe,
)
from apps.network.models import MembroRede, PapelNaRede, SituacaoMembro


class MembroEquipeSerializer(serializers.ModelSerializer):
    """
    Uma indicacao, com a justificativa visivel (RF06).

    `match_reasons` e `score_features` vao para a tela porque a baseline exige
    que o Supervisor veja *por que* a pessoa apareceu (glossario, Justificativa
    do Matching).
    """

    id_membro = serializers.IntegerField(source='membro_id', read_only=True)
    nome = serializers.CharField(source='membro.nome', read_only=True)
    email = serializers.EmailField(source='membro.email', read_only=True)
    titulacao = serializers.CharField(
        source='membro.titulacao.rotulo', read_only=True, default=None
    )
    disponibilidade = serializers.CharField(
        source='membro.get_disponibilidade_display', read_only=True
    )
    situacao_na_rede = serializers.CharField(
        source='membro.get_situacao_display', read_only=True
    )
    papel_rotulo = serializers.CharField(source='get_papel_display', read_only=True)
    origem_rotulo = serializers.CharField(source='get_origem_display', read_only=True)
    ajustado_por_nome = serializers.CharField(
        source='ajustado_por.nome', read_only=True, default=None
    )
    inativo = serializers.SerializerMethodField()

    class Meta:
        model = MembroEquipe
        fields = [
            'id_membro_equipe',
            'id_membro',
            'nome',
            'email',
            'titulacao',
            'disponibilidade',
            'situacao_na_rede',
            'inativo',
            'papel',
            'papel_rotulo',
            'score_compatibilidade',
            'justificativa',
            'match_reasons',
            'score_features',
            'incluido',
            'origem',
            'origem_rotulo',
            'validada',
            'ajustado_por_nome',
        ]
        read_only_fields = fields

    def get_inativo(self, indicacao) -> bool:
        """Quem saiu da rede continua na equipe ja gerada, marcado (P3)."""
        return indicacao.membro.situacao == SituacaoMembro.INATIVO


class LacunaEquipeSerializer(serializers.ModelSerializer):
    """A competencia que a composicao sugerida nao cobre (RF08)."""

    competencia = serializers.CharField(
        source='competencia_necessaria.descricao', read_only=True, default=None
    )
    nivel_importancia = serializers.CharField(
        source='competencia_necessaria.nivel_importancia',
        read_only=True,
        default=NivelImportancia.ESSENCIAL,
    )

    class Meta:
        model = LacunaCompetenciaEquipe
        fields = [
            'id_lacuna_equipe',
            'descricao',
            'competencia',
            'nivel_importancia',
            'criado_em',
        ]
        read_only_fields = fields


class ExecucaoMatchingSerializer(serializers.ModelSerializer):
    """A rodada: pesos, estrategia e se houve rerank ou fallback."""

    status_rotulo = serializers.CharField(source='get_status_display', read_only=True)
    ai_run_id = serializers.UUIDField(
        source='execucao_ia_id', read_only=True, default=None
    )

    class Meta:
        model = ExecucaoMatching
        fields = [
            'id_execucao',
            'estrategia',
            'pesos',
            'versao_modelo',
            'usou_rerank',
            'fallback_usado',
            'executado_por',
            'status',
            'status_rotulo',
            'erro',
            'ai_run_id',
            'iniciado_em',
            'concluido_em',
        ]
        read_only_fields = fields


class EquipePotencialSerializer(serializers.ModelSerializer):
    """A composicao sugerida inteira - o que a aba Equipe potencial desenha."""

    execucao = ExecucaoMatchingSerializer(read_only=True)
    membros = MembroEquipeSerializer(many=True, read_only=True)
    lacunas = LacunaEquipeSerializer(many=True, read_only=True)

    class Meta:
        model = EquipePotencial
        fields = ['id_equipe', 'data_geracao', 'execucao', 'membros', 'lacunas']
        read_only_fields = fields


class AjusteMembroSerializer(serializers.ModelSerializer):
    """O que o Supervisor pode mudar numa indicacao."""

    class Meta:
        model = MembroEquipe
        fields = ['incluido', 'papel']
        extra_kwargs = {
            'incluido': {'required': False},
            'papel': {'required': False},
        }


class InclusaoMembroSerializer(serializers.Serializer):
    """A inclusao manual: so gente da rede interna entra (CONTEXT.md secao 4)."""

    id_membro = serializers.IntegerField()
    papel = serializers.ChoiceField(choices=PapelNaRede.choices)

    def validate_id_membro(self, value):
        membro = MembroRede.objects.filter(id_membro=value).first()

        if membro is None:
            raise serializers.ValidationError('Pessoa não encontrada na rede interna.')

        if membro.situacao == SituacaoMembro.INATIVO:
            raise serializers.ValidationError(
                'Esta pessoa está inativa na rede interna.'
            )

        return value


class ItemMatchingIASerializer(serializers.Serializer):
    candidato_index = serializers.IntegerField()
    apelido = serializers.CharField(required=False, allow_blank=True)
    nome = serializers.CharField(required=False, allow_blank=True)
    score_compatibilidade = serializers.FloatField(required=False)
    match_reasons = serializers.ListField(
        child=serializers.CharField(allow_blank=True), required=False
    )
    score_features = serializers.DictField(required=False)
    papel_sugerido = serializers.CharField(required=False, allow_blank=True)


class SaidaMatchingSerializer(serializers.Serializer):
    """A fronteira com o provedor de IA no rerank (AGENTS.md 2.2)."""

    matches = ItemMatchingIASerializer(many=True, required=False)


class ResultadoMatchingSerializer(serializers.Serializer):
    """O que a rodada produziu, para a tela nao ter de recarregar tudo."""

    equipe = EquipePotencialSerializer(read_only=True)
    avaliados = serializers.IntegerField(read_only=True)
