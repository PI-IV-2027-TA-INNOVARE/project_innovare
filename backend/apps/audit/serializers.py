"""
Contrato da trilha de auditoria (RF12).

Leitura apenas. A tabela e append-only e nao ha serializer de escrita: quem
grava e o `registrar_evento`, a partir do service que causou o evento.
"""
from rest_framework import serializers

from apps.audit.models import CategoriaEvento, StatusEvento


class FiltroTrilhaSerializer(serializers.Serializer):
    """
    Os parametros de busca do console.

    Existe porque query string tambem e entrada externa (AGENTS.md secao 1):
    sem contrato, `?desde=ontem` viraria filtro ignorado, e o Administrador
    leria a lista inteira acreditando ter filtrado.
    """

    categoria = serializers.ChoiceField(
        choices=CategoriaEvento.choices, required=False
    )
    status = serializers.ChoiceField(choices=StatusEvento.choices, required=False)
    busca = serializers.CharField(required=False, allow_blank=True, max_length=160)
    desde = serializers.DateField(required=False)
    ate = serializers.DateField(required=False)

    def validate(self, dados):
        desde, ate = dados.get('desde'), dados.get('ate')

        if desde and ate and desde > ate:
            raise serializers.ValidationError(
                {'desde': 'O inicio do periodo e posterior ao fim.'}
            )

        return dados


class EventoTrilhaSerializer(serializers.Serializer):
    """Uma linha da trilha, como o console a mostra."""

    id_evento = serializers.IntegerField(read_only=True)
    ocorrido_em = serializers.DateTimeField(read_only=True)
    categoria = serializers.CharField(read_only=True)
    categoria_rotulo = serializers.CharField(
        source='get_categoria_display', read_only=True
    )
    tipo = serializers.CharField(read_only=True)
    ator = serializers.CharField(read_only=True)
    entidade = serializers.CharField(read_only=True)
    entidade_id = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    status_rotulo = serializers.CharField(source='get_status_display', read_only=True)
    motivo = serializers.CharField(read_only=True)
    detalhe = serializers.JSONField(read_only=True)
    correlation_id = serializers.UUIDField(read_only=True)
