"""
Contrato da Pre-analise de Maturidade (RF09, RF10).

Vocabulario sob vigilancia: nenhum campo se chama nota, parecer, score ou
aprovacao, e o `aviso` viaja junto do resultado para a tela nao ter como
esquecer que a analise e orientativa (AGENTS.md 0.2).
"""
from rest_framework import serializers

from apps.copilot.serializers import LacunaSerializer
from apps.maturity.models import (
    CriterioPreAnalise,
    DimensaoMaturidade,
    NivelDimensao,
    PreAnalise,
    PreAnaliseDimensao,
    Recomendacao,
)

AVISO_ORIENTATIVO = (
    'Análise orientativa do P&D Connect. Não é nota, parecer, aprovação, '
    'submissão nem decisão da FAPESP.'
)


class CriterioPreAnaliseSerializer(serializers.ModelSerializer):
    dimensao_rotulo = serializers.CharField(
        source='get_dimensao_display', read_only=True
    )

    class Meta:
        model = CriterioPreAnalise
        fields = [
            'id_criterio',
            'versao',
            'dimensao',
            'dimensao_rotulo',
            'codigo',
            'descricao',
            'peso',
            'vigente_de',
            'vigente_ate',
        ]
        read_only_fields = fields


class PreAnaliseDimensaoSerializer(serializers.ModelSerializer):
    dimensao_rotulo = serializers.CharField(
        source='get_dimensao_display', read_only=True
    )
    nivel_rotulo = serializers.CharField(source='get_nivel_display', read_only=True)

    class Meta:
        model = PreAnaliseDimensao
        fields = [
            'id_dimensao',
            'dimensao',
            'dimensao_rotulo',
            'avaliacao',
            'nivel',
            'nivel_rotulo',
            'evidencias',
            'ordem',
        ]
        read_only_fields = fields


class RecomendacaoSerializer(serializers.ModelSerializer):
    origem_rotulo = serializers.CharField(source='get_origem_display', read_only=True)

    class Meta:
        model = Recomendacao
        fields = [
            'id_recomendacao',
            'origem',
            'origem_rotulo',
            'texto',
            'acatada',
            'acatada_em',
            'criado_em',
        ]
        read_only_fields = fields


class PreAnaliseSerializer(serializers.ModelSerializer):
    """O Relatorio de Maturidade como a tela o apresenta."""

    dimensoes = PreAnaliseDimensaoSerializer(many=True, read_only=True)
    lacunas = LacunaSerializer(many=True, read_only=True)
    recomendacoes = RecomendacaoSerializer(many=True, read_only=True)
    status_rotulo = serializers.CharField(source='get_status_display', read_only=True)
    ai_run_id = serializers.UUIDField(
        source='execucao_ia_id', read_only=True, default=None
    )
    aviso = serializers.SerializerMethodField()

    class Meta:
        model = PreAnalise
        fields = [
            'id_pre_analise',
            'versao_criterios',
            'versao_proposta',
            'sintese',
            'executada_em',
            'executada_por',
            'status',
            'status_rotulo',
            'erro',
            'ai_run_id',
            'aviso',
            'dimensoes',
            'lacunas',
            'recomendacoes',
        ]
        read_only_fields = fields

    def get_aviso(self, instancia) -> str:
        return AVISO_ORIENTATIVO


class ItemDimensaoIASerializer(serializers.Serializer):
    dimensao = serializers.ChoiceField(choices=DimensaoMaturidade.choices)
    avaliacao = serializers.CharField(allow_blank=True, required=False)
    nivel = serializers.ChoiceField(choices=NivelDimensao.choices)
    evidencias = serializers.ListField(
        child=serializers.CharField(allow_blank=True), required=False
    )


class ItemLacunaIASerializer(serializers.Serializer):
    dimensao = serializers.CharField(allow_blank=True, required=False)
    descricao = serializers.CharField()


class SaidaPreAnaliseSerializer(serializers.Serializer):
    """
    A fronteira com o provedor de IA (AGENTS.md 2.2).

    Dimensao fora das seis do glossario e nivel fora dos tres rotulos invalidam
    a saida: o relatorio tem forma fixa, e aceitar rotulo novo quebraria a
    leitura comparada entre duas execucoes.
    """

    dimensoes = ItemDimensaoIASerializer(many=True, required=False)
    lacunas = ItemLacunaIASerializer(many=True, required=False)
    recomendacoes = serializers.ListField(
        child=serializers.CharField(allow_blank=True), required=False
    )
    sintese = serializers.CharField(allow_blank=True, required=False)


class ResultadoImportacaoCriteriosSerializer(serializers.Serializer):
    """O que a importacao da baseline fez."""

    versao = serializers.CharField(read_only=True)
    baseline_id = serializers.CharField(read_only=True)
    criados = serializers.IntegerField(read_only=True)
    atualizados = serializers.IntegerField(read_only=True)
    sem_dimensao = serializers.ListField(
        child=serializers.CharField(), read_only=True
    )


class AcatarRecomendacaoSerializer(serializers.Serializer):
    acatada = serializers.BooleanField()
