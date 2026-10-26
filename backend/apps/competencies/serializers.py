"""
Contrato da Competencia Necessaria (RF05).
"""
from rest_framework import serializers

from apps.competencies.models import CompetenciaNecessaria, NivelImportancia


class CompetenciaNecessariaSerializer(serializers.ModelSerializer):
    """
    O que a aba Competencias mostra.

    `derivada_de` vai para a tela de proposito: o Supervisor precisa saber o
    que a IA sugeriu e o que ele mesmo acrescentou (AGENTS.md 0.2).
    """

    nivel_rotulo = serializers.CharField(
        source='get_nivel_importancia_display', read_only=True
    )
    derivada_rotulo = serializers.CharField(
        source='get_derivada_de_display', read_only=True
    )
    no_vocabulario = serializers.SerializerMethodField()
    ai_run_id = serializers.UUIDField(
        source='execucao_ia_id', read_only=True, default=None
    )

    class Meta:
        model = CompetenciaNecessaria
        fields = [
            'id_competencia_necessaria',
            'descricao',
            'nivel_importancia',
            'nivel_rotulo',
            'derivada_de',
            'derivada_rotulo',
            'no_vocabulario',
            'ai_run_id',
            'criado_em',
            'atualizado_em',
        ]
        read_only_fields = fields

    def get_no_vocabulario(self, instancia) -> bool:
        """
        Se a competencia casou com um termo da rede.

        Importa na tela: termo fora do vocabulario pontua apenas pelo texto, e
        e o que explica um matching mais fraco do que o Supervisor esperava.
        """
        return instancia.competencia_id is not None


class CompetenciaNecessariaWriteSerializer(serializers.ModelSerializer):
    """Escrita manual e revisao - Supervisor apenas."""

    class Meta:
        model = CompetenciaNecessaria
        fields = ['descricao', 'nivel_importancia']

    def validate_descricao(self, value):
        texto = (value or '').strip()

        if not texto:
            raise serializers.ValidationError('Descreva a competência.')

        return texto


class ItemCompetenciaIASerializer(serializers.Serializer):
    descricao = serializers.CharField(max_length=200)
    nivel_importancia = serializers.ChoiceField(
        choices=NivelImportancia.choices,
        required=False,
        default=NivelImportancia.ESSENCIAL,
    )


class SaidaCompetenciasSerializer(serializers.Serializer):
    """A fronteira com o provedor de IA (AGENTS.md 2.2)."""

    competencias = ItemCompetenciaIASerializer(many=True, required=False)


class ResultadoDerivacaoSerializer(serializers.Serializer):
    """O que a rodada de derivacao produziu."""

    criadas = CompetenciaNecessariaSerializer(many=True, read_only=True)
    fallback_usado = serializers.BooleanField(read_only=True)
    motivo_fallback = serializers.CharField(read_only=True, allow_null=True)
    ai_run_id = serializers.UUIDField(read_only=True, allow_null=True)
