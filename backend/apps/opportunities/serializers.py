"""
Contrato da Oportunidade (RF01, RF12).

Vocabulario do cliente: oportunidade, origem, problema externo, ideia interna,
contexto, anexo, decisao, historico.
"""
from rest_framework import serializers

from apps.accounts.models import Papel
from apps.decisions.models import TipoDecisao
from apps.opportunities.models import (
    AnexoOportunidade,
    Oportunidade,
    OrigemOportunidade,
)


class DecisaoResumoSerializer(serializers.Serializer):
    """A ultima decisao, como a tela de acompanhamento precisa dela."""

    tipo = serializers.CharField(read_only=True)
    tipo_rotulo = serializers.CharField(source='get_tipo_display', read_only=True)
    justificativa = serializers.CharField(read_only=True)
    autor_nome = serializers.CharField(source='autor.nome', read_only=True)
    registrada_em = serializers.DateTimeField(read_only=True)


class AnexoSerializer(serializers.ModelSerializer):
    enviado_por_nome = serializers.CharField(
        source='enviado_por.nome', read_only=True, default=None
    )

    class Meta:
        model = AnexoOportunidade
        fields = [
            'id_anexo', 'nome_original', 'mime', 'tamanho_bytes',
            'enviado_por_nome', 'criado_em',
        ]
        read_only_fields = fields


class OportunidadeSerializer(serializers.ModelSerializer):
    origem_rotulo = serializers.CharField(
        source='get_origem_display', read_only=True
    )
    situacao_rotulo = serializers.CharField(
        source='get_situacao_display', read_only=True
    )
    demandante_nome = serializers.CharField(
        source='demandante.nome', read_only=True, default=None
    )
    responsavel_nome = serializers.CharField(
        source='responsavel.nome', read_only=True, default=None
    )
    total_anexos = serializers.IntegerField(
        source='anexos.count', read_only=True
    )
    ultima_decisao = serializers.SerializerMethodField()

    class Meta:
        model = Oportunidade
        fields = [
            'codigo', 'titulo', 'origem', 'origem_rotulo', 'resumo', 'contexto',
            'demandante', 'demandante_nome', 'responsavel', 'responsavel_nome',
            'situacao', 'situacao_rotulo', 'total_anexos', 'ultima_decisao',
            'criada_em', 'atualizada_em',
        ]
        read_only_fields = [
            'codigo', 'origem', 'demandante', 'situacao', 'ultima_decisao',
            'criada_em', 'atualizada_em',
        ]

    def get_ultima_decisao(self, oportunidade):
        """
        O desfecho mais recente.

        PB26 exige que o Demandante leia o pedido de revisao - e so ele. Em
        *Continuar* e *Arquivar* a justificativa e raciocinio interno, e PB71
        mantem o interno fora do alcance dele.
        """
        decisao = oportunidade.decisoes.first()

        if decisao is None:
            return None

        dados = DecisaoResumoSerializer(decisao).data
        usuario = getattr(self.context.get('request'), 'user', None)

        se_demandante = getattr(usuario, 'papel', None) == Papel.DEMANDANTE

        if se_demandante and decisao.tipo != TipoDecisao.REVISAR:
            dados['justificativa'] = ''

        return dados


class CadastroOportunidadeSerializer(serializers.Serializer):
    """
    Entrada das duas origens.

    `origem` nao vem do corpo: quem cadastra define qual porta e essa. O
    Demandante so consegue abrir problema externo (D01), e o Supervisor so
    ideia interna (RN-A03 / D05) - mandar `origem` pelo corpo deixaria a regra
    negociavel pelo cliente HTTP.
    """

    titulo = serializers.CharField(max_length=200)
    resumo = serializers.CharField(allow_blank=True, required=False, default='')
    contexto = serializers.CharField(allow_blank=True, required=False, default='')

    def __init__(self, *args, **kwargs):
        """
        O queryset do responsavel e montado aqui, e nao na classe: importar
        `network` no topo fecha um ciclo entre os dois apps na carga.
        """
        super().__init__(*args, **kwargs)

        from apps.network.models import MembroRede, PapelNaRede

        self.fields['responsavel'] = serializers.PrimaryKeyRelatedField(
            queryset=MembroRede.objects.filter(papel_rede=PapelNaRede.SUPERVISOR),
            required=False,
            allow_null=True,
        )


class DecisaoSerializer(serializers.Serializer):
    """
    RN-A07: a decisao e humana e do Supervisor.

    A justificativa e obrigatoria por rastreabilidade (RF12) - "arquivar" sem
    motivo registrado e o que ninguem reconstitui seis meses depois.
    """

    tipo = serializers.ChoiceField(choices=TipoDecisao.choices)
    justificativa = serializers.CharField(min_length=10)


class ComplementacaoSerializer(serializers.Serializer):
    """Resposta do Demandante ao pedido de complementacao (PB27)."""

    texto = serializers.CharField(min_length=5)


class EventoHistoricoSerializer(serializers.Serializer):
    """Leitura da trilha. Append-only: nao existe escrita por aqui."""

    ocorrido_em = serializers.DateTimeField(read_only=True)
    categoria = serializers.CharField(read_only=True)
    tipo = serializers.CharField(read_only=True)
    ator = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    detalhe = serializers.JSONField(read_only=True)


ORIGEM_POR_ATOR = {
    'demandante': OrigemOportunidade.EXTERNO,
    'supervisor': OrigemOportunidade.INTERNA,
}
