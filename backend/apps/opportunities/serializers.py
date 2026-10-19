"""
Contrato da Oportunidade (RF01, RF12).

Vocabulario do cliente: oportunidade, origem, problema externo, ideia interna,
contexto, anexo, decisao, historico.
"""
from rest_framework import serializers

from apps.accounts.models import Papel
from apps.competencies.serializers import CompetenciaNecessariaSerializer
from apps.copilot.serializers import PropostaEstruturadaSerializer
from apps.decisions.models import TipoDecisao
from apps.matching.serializers import EquipePotencialSerializer
from apps.maturity.serializers import (
    CriterioPreAnaliseSerializer,
    PreAnaliseSerializer,
)
from apps.opportunities.models import (
    AnexoOportunidade,
    Oportunidade,
    OrigemOportunidade,
)


class DecisaoResumoSerializer(serializers.Serializer):
    """A ultima decisao, como a tela de acompanhamento precisa dela."""

    tipo = serializers.CharField(source='tipo_decisao', read_only=True)
    tipo_rotulo = serializers.CharField(
        source='get_tipo_decisao_display', read_only=True
    )
    justificativa = serializers.CharField(source='observacoes', read_only=True)
    autor_nome = serializers.CharField(source='responsavel.nome', read_only=True)
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
    total_anexos = serializers.SerializerMethodField()
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

    def get_total_anexos(self, oportunidade):
        """
        Le a contagem que `fila_de` anotou; conta sozinho quando ela nao veio.

        A fila passa por `fila_de`; um objeto recem-salvo por um service, nao -
        e `create`, `partial_update` e `decisao` respondem com ele. Uma
        contagem para um registro so nao e o problema que esta sendo resolvido
        aqui; cem contagens numa listagem, sim.
        """
        anotado = getattr(oportunidade, 'total_anexos', None)

        return oportunidade.anexos.count() if anotado is None else anotado

    def get_ultima_decisao(self, oportunidade):
        """
        O desfecho mais recente.

        PB26 exige que o Demandante leia o pedido de revisao - e so ele. Em
        *Continuar* e *Arquivar* a justificativa e raciocinio interno, e PB71
        mantem o interno fora do alcance dele.

        A fatia atende os dois casos sem ramificar: com o lote de `fila_de` ela
        le o cache do prefetch e nao consulta nada; sem ele, vira um `LIMIT 1`.
        """
        decisoes = list(oportunidade.decisoes.all()[:1])

        if not decisoes:
            return None

        decisao = decisoes[0]

        dados = DecisaoResumoSerializer(decisao).data
        usuario = getattr(self.context.get('request'), 'user', None)

        se_demandante = getattr(usuario, 'papel', None) == Papel.DEMANDANTE

        if se_demandante and decisao.tipo_decisao != TipoDecisao.REVISAR:
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


class SolicitacaoComplementoSerializer(serializers.Serializer):
    """
    O pedido de informacao complementar ao Demandante (PB26).

    Mesmo teto da observacao, e pelo mesmo motivo: a mensagem vai para o
    `detalhe` da trilha, que e JSON, e tambem para o corpo da notificacao. E
    campo de pedido, nao de anexo.
    """

    mensagem = serializers.CharField(
        min_length=5, max_length=2000, trim_whitespace=True
    )


class SolicitacaoRegistradaSerializer(serializers.Serializer):
    """O que a tela recebe de volta para mostrar o pedido sem recarregar tudo."""

    ocorrido_em = serializers.DateTimeField(read_only=True)
    mensagem = serializers.CharField(read_only=True)
    autor_nome = serializers.CharField(read_only=True)


class ObservacaoSerializer(serializers.Serializer):
    """
    Nota do Supervisor durante a avaliacao (PB65).

    O teto de 2000 caracteres existe porque o texto vai para o `detalhe` da
    trilha, que e JSON: o campo e de nota, nao de anexo.
    """

    texto = serializers.CharField(min_length=5, max_length=2000, trim_whitespace=True)


class ObservacaoRegistradaSerializer(serializers.Serializer):
    """O que a tela recebe de volta para mostrar a nota sem recarregar tudo."""

    ocorrido_em = serializers.DateTimeField(read_only=True)
    texto = serializers.CharField(read_only=True)
    autor_nome = serializers.CharField(read_only=True)


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

class SecaoPendenteSerializer(serializers.Serializer):
    """Secao que o relatorio reconhece e ainda nao tem conteudo (PB76)."""

    secao = serializers.CharField(read_only=True)
    motivo = serializers.CharField(read_only=True)


class RelatorioOportunidadeSerializer(serializers.Serializer):
    """
    O documento consolidado da oportunidade (PB76).

    Reaproveita os contratos que as telas ja consomem: a identificacao e o
    mesmo `OportunidadeSerializer` da fila, os anexos e a decisao sao os
    mesmos da conducao. Um relatorio que inventasse forma propria para os
    mesmos dados viraria um segundo contrato para manter.
    """

    oportunidade = OportunidadeSerializer(read_only=True)
    anexos = AnexoSerializer(many=True, read_only=True)
    historico = EventoHistoricoSerializer(many=True, read_only=True)
    decisao = DecisaoResumoSerializer(read_only=True, allow_null=True)
    proposta = PropostaEstruturadaSerializer(read_only=True, allow_null=True)
    competencias = CompetenciaNecessariaSerializer(many=True, read_only=True)
    equipe = EquipePotencialSerializer(read_only=True, allow_null=True)
    pre_analise = PreAnaliseSerializer(read_only=True, allow_null=True)
    pendentes = SecaoPendenteSerializer(many=True, read_only=True)
    gerado_em = serializers.DateTimeField(read_only=True)


class RelatorioPreAnaliseSerializer(serializers.Serializer):
    """
    O Relatorio da Pre-analise (PB78).

    Reaproveita os contratos das abas: a identificacao e o mesmo
    `OportunidadeSerializer` da fila, e a analise e a mesma
    `PreAnaliseSerializer` da aba - que ja carrega o aviso de que o resultado e
    orientativo. `criterios` sao os da versao citada pela execucao, nao os
    vigentes de hoje.
    """

    oportunidade = OportunidadeSerializer(read_only=True)
    proposta = PropostaEstruturadaSerializer(read_only=True)
    pre_analise = PreAnaliseSerializer(read_only=True)
    criterios = CriterioPreAnaliseSerializer(many=True, read_only=True)
    equipe = EquipePotencialSerializer(read_only=True, allow_null=True)
    gerado_em = serializers.DateTimeField(read_only=True)


class RelatorioEquipeSerializer(serializers.Serializer):
    """
    O Relatorio de Equipe Potencial (PB77).

    `equipe` ja carrega os membros com `match_reasons`, `score_features` e as
    lacunas da composicao, e `execucao` dentro dela traz os pesos da rodada -
    a regua da aderencia. `competencias` sao as que a rodada comparou.
    """

    oportunidade = OportunidadeSerializer(read_only=True)
    equipe = EquipePotencialSerializer(read_only=True)
    competencias = CompetenciaNecessariaSerializer(many=True, read_only=True)
    gerado_em = serializers.DateTimeField(read_only=True)
