"""
Contrato da pagina de Saude (plano 5.2 e 5.3).

A lista de campos do bloco de IA e a da secao Observabilidade de
`docs/Engenharia_IA/Metodos_Integracao_IA.md` - latencia, erros, tokens, custo,
tamanho do contexto, modelo, versao de prompt e avaliacao humana. Campo que nao
esteja la, ou que nao sirva de regua para um numero que esteja, nao entra.

Cada bloco tem um par `<bloco>_erro`: a tela precisa poder dizer "nao consegui
ler este bloco" sem perder os outros.
"""
from rest_framework import serializers


class DesempenhoSerializer(serializers.Serializer):
    """
    Latencia da API contra os 3 s (`CONTEXT.md` secao 6 + RNF do TAP).

    `amostras` acompanha os percentis porque p90 de tres requisicoes nao e p90:
    sem o tamanho da amostra, o numero convida a conclusao que ele nao sustenta.
    """

    amostras = serializers.IntegerField(read_only=True)
    p50_ms = serializers.FloatField(read_only=True, allow_null=True)
    p90_ms = serializers.FloatField(read_only=True, allow_null=True)
    limite_ms = serializers.IntegerField(read_only=True)
    acima_do_limite = serializers.IntegerField(read_only=True)


class RevisaoHumanaSerializer(serializers.Serializer):
    """
    A "avaliacao humana" da secao Observabilidade.

    Quanto da saida de IA passou por gente: proposta revisada, indicacao
    validada, recomendacao acatada. Sao as colunas que o AGENTS.md 0.2 exige
    que existam - aqui elas viram numero.
    """

    propostas_de_ia = serializers.IntegerField(read_only=True)
    propostas_revisadas = serializers.IntegerField(read_only=True)
    indicacoes = serializers.IntegerField(read_only=True)
    indicacoes_validadas = serializers.IntegerField(read_only=True)
    equipes_geradas = serializers.IntegerField(read_only=True)
    recomendacoes = serializers.IntegerField(read_only=True)
    recomendacoes_acatadas = serializers.IntegerField(read_only=True)


class UltimaExecucaoSerializer(serializers.Serializer):
    """Modelo e versao de prompt da ultima chamada - dois itens da lista."""

    id = serializers.CharField(read_only=True)
    tipo = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    versao_prompt = serializers.CharField(read_only=True, allow_blank=True)
    criado_em = serializers.DateTimeField(read_only=True)
    fallback_usado = serializers.BooleanField(read_only=True)
    erro = serializers.CharField(read_only=True, allow_blank=True)


class ProvedorDeIASerializer(serializers.Serializer):
    """Uma linha por provedor registrado - o que o painel mostra por provedor."""

    nome = serializers.CharField(read_only=True)
    rotulo = serializers.CharField(read_only=True)
    papel = serializers.CharField(read_only=True)
    configurado = serializers.BooleanField(read_only=True)
    modelo = serializers.CharField(read_only=True, allow_blank=True)
    chamadas = serializers.IntegerField(read_only=True)
    erros = serializers.IntegerField(read_only=True)
    fallbacks = serializers.IntegerField(read_only=True)
    custo_estimado_brl = serializers.FloatField(read_only=True)
    custo_apurado = serializers.BooleanField(read_only=True)
    latencia_media_ms = serializers.IntegerField(read_only=True, allow_null=True)
    preco_entrada_brl_por_milhao = serializers.FloatField(read_only=True)
    preco_saida_brl_por_milhao = serializers.FloatField(read_only=True)


class ConsumoDeIASerializer(serializers.Serializer):
    """
    O consumo do mes - e o que dele e medido de fato.

    `estado` e `custo_apurado` existem porque a tela nao pode apresentar
    ausencia de apuracao como gasto zero confirmado. Hoje o custo e calculado
    (`services/custo.py`), mas so quando ha tabela de preco configurada: sem
    `AI_CUSTO_*_BRL_POR_MILHAO`, a barra diz "sem apuracao" em vez de marcar 0%.

    `preco_*_por_milhao` acompanha o custo porque e a regua: o gasto nao se
    interpreta sem o preco que o produziu - a mesma razao pela qual o relatorio
    de equipe mostra os pesos da rodada.

    `por_tipo` fica como leitura de "o que consumiu": o total de chamadas sem o
    corte por operacao nao responde onde olhar primeiro.
    """

    janela_desde = serializers.DateTimeField(read_only=True)
    houve_execucao = serializers.BooleanField(read_only=True)
    custo_apurado = serializers.BooleanField(read_only=True)
    estado = serializers.CharField(read_only=True)
    percentual_de_alerta = serializers.IntegerField(read_only=True)
    chamadas = serializers.IntegerField(read_only=True)
    por_tipo = serializers.DictField(child=serializers.IntegerField(), read_only=True)
    custo_por_tipo = serializers.DictField(
        child=serializers.FloatField(), read_only=True
    )
    erros = serializers.IntegerField(read_only=True)
    fallbacks = serializers.IntegerField(read_only=True)
    tokens_entrada = serializers.IntegerField(read_only=True)
    tokens_saida = serializers.IntegerField(read_only=True)
    contexto_medio_tokens = serializers.IntegerField(read_only=True, allow_null=True)
    custo_estimado_brl = serializers.FloatField(read_only=True)
    preco_entrada_brl_por_milhao = serializers.FloatField(read_only=True)
    preco_saida_brl_por_milhao = serializers.FloatField(read_only=True)
    teto_mensal_brl = serializers.FloatField(read_only=True)
    percentual_do_teto = serializers.FloatField(read_only=True, allow_null=True)
    saldo_brl = serializers.FloatField(read_only=True, allow_null=True)
    p50_ms = serializers.FloatField(read_only=True, allow_null=True)
    p90_ms = serializers.FloatField(read_only=True, allow_null=True)
    provedor_configurado = serializers.BooleanField(read_only=True)
    rerank_habilitado = serializers.BooleanField(read_only=True)
    modelo = serializers.CharField(read_only=True)
    provedores = ProvedorDeIASerializer(many=True, read_only=True)
    revisao_humana = RevisaoHumanaSerializer(read_only=True)
    ultima_execucao = UltimaExecucaoSerializer(read_only=True, allow_null=True)


class JobsSerializer(serializers.Serializer):
    """A fila que `Metodos_Integracao_IA.md` preve como pipeline assincrono."""

    configurado = serializers.BooleanField(read_only=True)
    esperada = serializers.BooleanField(read_only=True)
    motivo = serializers.CharField(read_only=True, allow_blank=True)


class BancoSerializer(serializers.Serializer):
    """Se o banco responde. Motor, uptime e pool sairam na poda (plano 5.3)."""

    responde = serializers.BooleanField(read_only=True)
    erro = serializers.CharField(read_only=True, allow_blank=True)


class SaudeSerializer(serializers.Serializer):
    desempenho = DesempenhoSerializer(read_only=True, allow_null=True)
    desempenho_erro = serializers.CharField(read_only=True, allow_blank=True)
    ia = ConsumoDeIASerializer(read_only=True, allow_null=True)
    ia_erro = serializers.CharField(read_only=True, allow_blank=True)
    jobs = JobsSerializer(read_only=True, allow_null=True)
    jobs_erro = serializers.CharField(read_only=True, allow_blank=True)
    banco = BancoSerializer(read_only=True, allow_null=True)
    banco_erro = serializers.CharField(read_only=True, allow_blank=True)
