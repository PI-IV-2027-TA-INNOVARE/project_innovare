"""
Contrato dos indicadores (RF14).

Saida calculada tambem e fronteira: sem serializer, a tela passaria a depender
do formato que o `dict` do service tiver no dia (AGENTS.md secao 1).
"""
from rest_framework import serializers


class ContagemSerializer(serializers.Serializer):
    """Uma barra do grafico: o valor do enum, o rotulo legivel e o total."""

    valor = serializers.CharField(read_only=True)
    rotulo = serializers.CharField(read_only=True)
    total = serializers.IntegerField(read_only=True)


class OportunidadesSerializer(serializers.Serializer):
    total = serializers.IntegerField(read_only=True)
    por_situacao = ContagemSerializer(many=True, read_only=True)
    por_origem = ContagemSerializer(many=True, read_only=True)


class DecisoesSerializer(serializers.Serializer):
    total = serializers.IntegerField(read_only=True)
    por_tipo = ContagemSerializer(many=True, read_only=True)


class RedeSerializer(serializers.Serializer):
    total = serializers.IntegerField(read_only=True)
    por_papel = ContagemSerializer(many=True, read_only=True)


class IndicadoresSerializer(serializers.Serializer):
    """`rede` vem nulo para quem nao consulta a rede interna."""

    oportunidades = OportunidadesSerializer(read_only=True)
    decisoes = DecisoesSerializer(read_only=True)
    rede = RedeSerializer(read_only=True, allow_null=True)


class RedePorDisponibilidadeSerializer(serializers.Serializer):
    total = serializers.IntegerField(read_only=True)
    por_disponibilidade = ContagemSerializer(many=True, read_only=True)


class IndicadoresDeMatchingSerializer(serializers.Serializer):
    """
    PB74 - a capacidade da rede de atender as competencias demandadas.

    `houve_rodada` viaja com os numeros de proposito: sem ele, uma rede que
    nunca rodou matching e uma rede que rodou e nao cobriu nada chegam na tela
    com os mesmos zeros.
    """

    houve_rodada = serializers.BooleanField(read_only=True)
    execucoes = serializers.IntegerField(read_only=True)
    execucoes_concluidas = serializers.IntegerField(read_only=True)
    execucoes_com_rerank = serializers.IntegerField(read_only=True)
    execucoes_sem_base_semantica = serializers.IntegerField(read_only=True)
    equipes_geradas = serializers.IntegerField(read_only=True)
    indicacoes = serializers.IntegerField(read_only=True)
    indicacoes_sugeridas = serializers.IntegerField(read_only=True)
    indicacoes_manuais = serializers.IntegerField(read_only=True)
    indicacoes_incluidas = serializers.IntegerField(read_only=True)
    indicacoes_validadas = serializers.IntegerField(read_only=True)
    score_medio = serializers.FloatField(read_only=True, allow_null=True)
    competencias_demandadas = serializers.IntegerField(read_only=True)
    competencias_essenciais = serializers.IntegerField(read_only=True)
    competencias_no_vocabulario = serializers.IntegerField(read_only=True)
    competencias_cobertas = serializers.IntegerField(read_only=True)
    competencias_com_lacuna = serializers.IntegerField(read_only=True)
    cobertura_percentual = serializers.FloatField(read_only=True, allow_null=True)
    rede = RedePorDisponibilidadeSerializer(read_only=True)


class IndicadoresDeMaturidadeSerializer(serializers.Serializer):
    """PB75 - nivel por dimensao, lacunas e recomendacoes. Nunca uma nota."""

    houve_execucao = serializers.BooleanField(read_only=True)
    execucoes = serializers.IntegerField(read_only=True)
    execucoes_concluidas = serializers.IntegerField(read_only=True)
    execucoes_com_erro = serializers.IntegerField(read_only=True)
    propostas_analisadas = serializers.IntegerField(read_only=True)
    dimensoes_avaliadas = serializers.IntegerField(read_only=True)
    por_nivel = ContagemSerializer(many=True, read_only=True)
    por_dimensao = ContagemSerializer(many=True, read_only=True)
    frageis_por_dimensao = ContagemSerializer(many=True, read_only=True)
    lacunas = serializers.IntegerField(read_only=True)
    lacunas_abertas = serializers.IntegerField(read_only=True)
    recomendacoes = serializers.IntegerField(read_only=True)
    recomendacoes_acatadas = serializers.IntegerField(read_only=True)
    versao_criterios = serializers.CharField(read_only=True, allow_null=True)


class IndicadoresDeIASerializer(serializers.Serializer):
    """Os dois blocos das fases 3.2/3.3, num `GET` so."""

    matching = IndicadoresDeMatchingSerializer(read_only=True)
    maturidade = IndicadoresDeMaturidadeSerializer(read_only=True)
