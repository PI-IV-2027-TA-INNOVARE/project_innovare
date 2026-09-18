"""Contrato de fronteira da configuracao administravel."""
from rest_framework import serializers

from apps.platform_settings.models import ConfiguracaoPlataforma


class ConfiguracaoSerializer(serializers.ModelSerializer):
    """
    Leitura da secao.

    `revisao` e `atualizado_por_nome` sao o que permite avisar "tema alterado
    por Fulano" sem poll.
    """

    atualizado_por_nome = serializers.CharField(
        source='atualizado_por.nome', read_only=True, default=None
    )

    class Meta:
        model = ConfiguracaoPlataforma
        fields = ['secao', 'payload', 'revisao', 'atualizado_em', 'atualizado_por_nome']
        read_only_fields = fields


def secao_vazia(secao):
    """A resposta de uma secao que ninguem gravou - mesmo formato do serializer."""
    return {
        'secao': secao,
        'payload': {},
        'revisao': 0,
        'atualizado_em': None,
        'atualizado_por_nome': None,
    }
