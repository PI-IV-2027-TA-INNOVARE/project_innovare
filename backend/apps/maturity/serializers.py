"""
Contrato da Pre-analise de Maturidade (RF09, RF10).

Vocabulario sob vigilancia: nenhum campo se chama nota, parecer, score ou
aprovacao, e o `aviso` viaja junto do resultado para a tela nao ter como
esquecer que a analise e orientativa (AGENTS.md 0.2).
"""
from drf_spectacular.utils import extend_schema_field
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
    versao = serializers.CharField(source='versao_criterio.versao', read_only=True)
    vigente_de = serializers.DateField(
        source='versao_criterio.vigente_de', read_only=True
    )
    vigente_ate = serializers.DateField(
        source='versao_criterio.vigente_ate', read_only=True
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


def rotulo_do_criterio(criterio) -> str | None:
    """O nome curto do criterio, sem a pergunta de avaliacao."""
    if criterio is None:
        return None

    return criterio.descricao.partition(' — ')[0].strip() or criterio.codigo


class RecomendacaoSerializer(serializers.ModelSerializer):
    """
    A recomendacao com a lacuna que ela resolve e o criterio de origem.

    `sem_evidencia` e o que a tela mostra quando nao ha criterio a citar.
    """

    origem_rotulo = serializers.CharField(source='get_origem_display', read_only=True)
    id_lacuna = serializers.IntegerField(source='lacuna_id', read_only=True, allow_null=True)
    criterio_codigo = serializers.SerializerMethodField()
    criterio_rotulo = serializers.SerializerMethodField()
    sem_evidencia = serializers.SerializerMethodField()

    def get_criterio_codigo(self, recomendacao) -> str | None:
        criterio = getattr(recomendacao.lacuna, 'criterio', None)
        return criterio.codigo if criterio else None

    def get_criterio_rotulo(self, recomendacao) -> str | None:
        return rotulo_do_criterio(getattr(recomendacao.lacuna, 'criterio', None))

    def get_sem_evidencia(self, recomendacao) -> bool:
        return getattr(recomendacao.lacuna, 'criterio', None) is None

    class Meta:
        model = Recomendacao
        fields = [
            'id_recomendacao',
            'origem',
            'origem_rotulo',
            'id_lacuna',
            'criterio_codigo',
            'criterio_rotulo',
            'sem_evidencia',
            'texto',
            'acatada',
            'acatada_em',
            'criado_em',
        ]
        read_only_fields = fields


class RodadaAnteriorSerializer(serializers.Serializer):
    id_pre_analise = serializers.UUIDField()
    executada_em = serializers.DateTimeField()
    versao_proposta = serializers.IntegerField()
    versao_criterios = serializers.CharField()


class MovimentoDimensaoSerializer(serializers.Serializer):
    MOVIMENTOS = ('avancou', 'recuou', 'manteve', 'nova', 'sem_avaliacao')

    dimensao = serializers.ChoiceField(choices=DimensaoMaturidade.choices)
    dimensao_rotulo = serializers.CharField()
    nivel_anterior = serializers.ChoiceField(
        choices=NivelDimensao.choices, allow_null=True
    )
    nivel_atual = serializers.ChoiceField(
        choices=NivelDimensao.choices, allow_null=True
    )
    movimento = serializers.ChoiceField(choices=MOVIMENTOS)


class ContagemDeLacunasSerializer(serializers.Serializer):
    anterior = serializers.IntegerField()
    atual = serializers.IntegerField()


class ComparacaoSerializer(serializers.Serializer):
    """A evolucao em relacao a rodada anterior (PB59). Nivel, nunca nota."""

    anterior = RodadaAnteriorSerializer()
    mesmos_criterios = serializers.BooleanField()
    dimensoes = MovimentoDimensaoSerializer(many=True)
    lacunas = ContagemDeLacunasSerializer()


class PreAnaliseSerializer(serializers.ModelSerializer):
    """O Relatorio de Maturidade como a tela o apresenta."""

    dimensoes = PreAnaliseDimensaoSerializer(many=True, read_only=True)
    lacunas = LacunaSerializer(many=True, read_only=True)
    recomendacoes = RecomendacaoSerializer(many=True, read_only=True)
    versao_criterios = serializers.CharField(
        source='versao_criterio.versao', read_only=True
    )
    status_rotulo = serializers.CharField(source='get_status_display', read_only=True)
    ai_run_id = serializers.UUIDField(
        source='execucao_ia_id', read_only=True, default=None
    )
    aviso = serializers.SerializerMethodField()
    comparacao = serializers.SerializerMethodField()

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
            'comparacao',
        ]
        read_only_fields = fields

    def get_aviso(self, instancia) -> str:
        return AVISO_ORIENTATIVO

    @extend_schema_field(ComparacaoSerializer(allow_null=True))
    def get_comparacao(self, instancia):
        from apps.maturity.services import comparacao_com_anterior

        comparacao = comparacao_com_anterior(instancia)

        return None if comparacao is None else ComparacaoSerializer(comparacao).data


class ItemDimensaoIASerializer(serializers.Serializer):
    dimensao = serializers.ChoiceField(choices=DimensaoMaturidade.choices)
    avaliacao = serializers.CharField(allow_blank=True, required=False)
    nivel = serializers.ChoiceField(choices=NivelDimensao.choices)
    evidencias = serializers.ListField(
        child=serializers.CharField(allow_blank=True), required=False
    )


class ItemLacunaIASerializer(serializers.Serializer):
    id = serializers.CharField(allow_blank=True, required=False)
    dimensao = serializers.CharField(allow_blank=True, required=False)
    criterio = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    descricao = serializers.CharField()


class ItemRecomendacaoIASerializer(serializers.Serializer):
    lacuna = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    criterio = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    texto = serializers.CharField(allow_blank=True)
    sem_evidencia = serializers.BooleanField(required=False, default=False)


class SaidaPreAnaliseSerializer(serializers.Serializer):
    """
    A fronteira com o provedor de IA (AGENTS.md 2.2).

    Dimensao fora das seis do glossario e nivel fora dos tres rotulos invalidam
    a saida: o relatorio tem forma fixa, e aceitar rotulo novo quebraria a
    leitura comparada entre duas execucoes.
    """

    dimensoes = ItemDimensaoIASerializer(many=True, required=False)
    lacunas = ItemLacunaIASerializer(many=True, required=False)
    recomendacoes = ItemRecomendacaoIASerializer(many=True, required=False)
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
