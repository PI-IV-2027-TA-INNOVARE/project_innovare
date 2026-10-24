"""
Contrato da Proposta Estruturada (RF04) e Sessao do Copiloto.
"""
from rest_framework import serializers

from apps.copilot.models import (
    EstadoSessao,
    Lacuna,
    MensagemCopiloto,
    PropostaEstruturada,
    SessaoCopiloto,
)
from apps.opportunities.models import Oportunidade


class PropostaEstruturadaSerializer(serializers.ModelSerializer):
    """Os oito elementos do RF04, editaveis pelo Supervisor."""

    oportunidade_codigo = serializers.CharField(
        source='oportunidade.codigo', read_only=True
    )
    revisor_nome = serializers.CharField(
        source='revisor.nome', read_only=True, default=None
    )
    objetivos_especificos = serializers.ListField(
        child=serializers.CharField(allow_blank=True), required=False
    )

    class Meta:
        model = PropostaEstruturada
        fields = [
            'id_proposta',
            'oportunidade_codigo',
            'problema_pesquisa',
            'hipotese',
            'objetivo_geral',
            'objetivos_especificos',
            'metodologia',
            'resultados_esperados',
            'caracterizacao_inovacao',
            'infraestrutura_recursos',
            'versao',
            'revisada_por_humano',
            'revisor_nome',
            'criado_em',
            'atualizado_em',
        ]
        read_only_fields = [
            'id_proposta',
            'oportunidade_codigo',
            'versao',
            'revisor_nome',
            'criado_em',
            'atualizado_em',
        ]



class PropostaEstruturadaWriteSerializer(serializers.ModelSerializer):
    """Escrita dos oito elementos — Supervisor apenas."""

    objetivos_especificos = serializers.ListField(
        child=serializers.CharField(allow_blank=True), required=False
    )

    class Meta:
        model = PropostaEstruturada
        fields = [
            'problema_pesquisa',
            'hipotese',
            'objetivo_geral',
            'objetivos_especificos',
            'metodologia',
            'resultados_esperados',
            'caracterizacao_inovacao',
            'infraestrutura_recursos',
        ]



class SessaoCopilotoSerializer(serializers.ModelSerializer):
    oportunidade_codigo = serializers.CharField(
        source='oportunidade.codigo', read_only=True
    )
    iniciada_por_nome = serializers.CharField(
        source='iniciada_por.nome', read_only=True, default=None
    )
    estado_rotulo = serializers.CharField(
        source='get_estado_display', read_only=True
    )

    class Meta:
        model = SessaoCopiloto
        fields = [
            'id_sessao',
            'oportunidade_codigo',
            'iniciada_por',
            'iniciada_por_nome',
            'estado',
            'estado_rotulo',
            'criado_em',
            'encerrado_em',
        ]
        read_only_fields = fields


class MensagemCopilotoSerializer(serializers.ModelSerializer):
    autor_rotulo = serializers.CharField(
        source='get_autor_display', read_only=True
    )

    class Meta:
        model = MensagemCopiloto
        fields = [
            'id_mensagem',
            'sessao',
            'autor',
            'autor_rotulo',
            'conteudo',
            'ordem',
            'criado_em',
        ]
        read_only_fields = fields


class LacunaSerializer(serializers.ModelSerializer):
    tipo_rotulo = serializers.CharField(
        source='get_tipo_display', read_only=True
    )
    severidade_rotulo = serializers.CharField(
        source='get_severidade_display', read_only=True, default=None
    )

    class Meta:
        model = Lacuna
        fields = [
            'id_lacuna',
            'tipo',
            'tipo_rotulo',
            'campo_afetado',
            'descricao',
            'recomendacao',
            'severidade',
            'severidade_rotulo',
            'resolvida',
            'resolvida_em',
            'criado_em',
        ]
        read_only_fields = fields


class SaidaCopilotoSerializer(serializers.Serializer):
    """
    A fronteira com o provedor de IA (AGENTS.md 2.2).

    O que o Gemini devolve nao entra no banco sem passar por aqui: campo com
    tipo errado invalida a rodada inteira, e a execucao fica registrada como
    saida nao aceita em vez de gravar meia proposta. Chave desconhecida - o
    `_erro_parse` do gateway, por exemplo - e ignorada.
    """

    problema_pesquisa = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    hipotese = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    objetivo_geral = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    objetivos_especificos = serializers.ListField(
        child=serializers.CharField(allow_blank=True), required=False
    )
    metodologia = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    resultados_esperados = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    caracterizacao_inovacao = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    infraestrutura_recursos = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )


class PerguntaOrientadoraSerializer(serializers.Serializer):
    """Uma pergunta do banco da baseline PIPE, ligada ao elemento que falta."""

    id = serializers.CharField(read_only=True)
    elemento = serializers.CharField(read_only=True)
    pergunta = serializers.CharField(read_only=True)
    motivo = serializers.CharField(read_only=True)
    campo = serializers.CharField(read_only=True)


class EstadoCopilotoSerializer(serializers.Serializer):
    """O que a aba Copiloto precisa para desenhar a tela inteira."""

    sessao = SessaoCopilotoSerializer(read_only=True, allow_null=True)
    mensagens = MensagemCopilotoSerializer(many=True, read_only=True)
    perguntas = PerguntaOrientadoraSerializer(many=True, read_only=True)
    lacunas = LacunaSerializer(many=True, read_only=True)
    elementos_vazios = serializers.ListField(
        child=serializers.CharField(), read_only=True
    )
    proposta_iniciada = serializers.BooleanField(read_only=True)
    base_disponivel = serializers.BooleanField(read_only=True)
    baseline_id = serializers.CharField(read_only=True)


class RespostaCopilotoSerializer(serializers.Serializer):
    """A resposta humana a uma pergunta orientadora."""

    texto = serializers.CharField(allow_blank=False, trim_whitespace=True)


class ResultadoEstruturacaoSerializer(serializers.Serializer):
    """
    O que a rodada produziu.

    `ai_run_id` e `fallback_usado` sao contrato, nao enfeite: a DoD exige que a
    tela possa dizer de qual execucao veio o texto (AGENTS.md 4.4).
    """

    preenchidos = serializers.ListField(
        child=serializers.CharField(), read_only=True
    )
    lacunas = LacunaSerializer(many=True, read_only=True)
    fallback_usado = serializers.BooleanField(read_only=True)
    ai_run_id = serializers.UUIDField(read_only=True, allow_null=True)
    proposta = PropostaEstruturadaSerializer(read_only=True)