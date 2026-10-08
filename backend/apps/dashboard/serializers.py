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
