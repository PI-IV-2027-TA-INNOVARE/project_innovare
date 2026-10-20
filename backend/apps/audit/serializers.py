"""
Contrato da trilha de auditoria (RF12).

Leitura apenas. A tabela e append-only e nao ha serializer de escrita: quem
grava e o `registrar_evento`, a partir do service que causou o evento.
"""
from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.audit.models import CategoriaEvento, StatusEvento
from apps.audit.rotulos import rotulo_do_tipo
from apps.audit.services.leitura import leitura_da_pagina


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


class AlvoSerializer(serializers.Serializer):
    """Sobre o que foi o evento, como o Administrador o reconhece."""

    rotulo = serializers.CharField()
    oportunidade = serializers.CharField(allow_null=True)
    removido = serializers.BooleanField()


class EventoTrilhaSerializer(serializers.Serializer):
    """Uma linha da trilha, como o console a mostra."""

    id_evento = serializers.IntegerField(read_only=True)
    ocorrido_em = serializers.DateTimeField(read_only=True)
    categoria = serializers.CharField(read_only=True)
    categoria_rotulo = serializers.CharField(
        source='get_categoria_display', read_only=True
    )
    tipo = serializers.CharField(read_only=True)
    tipo_rotulo = serializers.SerializerMethodField()
    ator = serializers.CharField(read_only=True)
    ator_nome = serializers.SerializerMethodField()
    alvo = serializers.SerializerMethodField()
    entidade = serializers.CharField(read_only=True)
    entidade_id = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    status_rotulo = serializers.CharField(source='get_status_display', read_only=True)
    motivo = serializers.CharField(read_only=True)
    detalhe = serializers.JSONField(read_only=True)
    correlation_id = serializers.UUIDField(read_only=True)

    def _leitura(self, evento) -> dict[str, Any]:
        """
        O que a view resolveu em lote para a pagina. Fora dela - um evento
        serializado sozinho - resolve so este, com o mesmo resultado.
        """
        leitura = self.context.get('leitura')

        if leitura is None or evento.id_evento not in leitura:
            leitura = leitura_da_pagina([evento])

        return leitura[evento.id_evento]

    def get_tipo_rotulo(self, evento) -> str:
        return rotulo_do_tipo(evento.tipo, evento.entidade)

    def get_ator_nome(self, evento) -> str:
        return self._leitura(evento)['ator_nome']

    @extend_schema_field(AlvoSerializer)
    def get_alvo(self, evento) -> dict[str, Any]:
        return AlvoSerializer(self._leitura(evento)['alvo']).data
