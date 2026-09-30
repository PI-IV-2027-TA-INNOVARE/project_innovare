"""
Contrato da caixa de notificacoes (PB26).

Leitura apenas. Quem cria notificacao e o service do fluxo que a motivou -
nao existe serializer de escrita porque nao existe rota que crie aviso a mao.
"""
from rest_framework import serializers


class FiltroCaixaSerializer(serializers.Serializer):
    """
    O unico filtro do sino: tudo, ou so o que ainda nao foi lido.

    Existe porque query string tambem e entrada externa (AGENTS.md secao 1):
    sem contrato, `?apenas_nao_lidas=talvez` viraria filtro ignorado, e a tela
    mostraria a caixa inteira acreditando ter filtrado.
    """

    apenas_nao_lidas = serializers.BooleanField(required=False, default=False)


class NotificacaoSerializer(serializers.Serializer):
    """
    Uma linha da caixa.

    `entidade` e `entidade_id` vao crus de proposito: o destino do clique muda
    com o papel de quem le - o Demandante abre `/problemas/:codigo` e o
    Supervisor `/oportunidades/:codigo`. Quem conhece rota e a tela.
    """

    id_notificacao = serializers.IntegerField(read_only=True)
    tipo = serializers.CharField(read_only=True)
    titulo = serializers.CharField(read_only=True)
    mensagem = serializers.CharField(read_only=True)
    entidade = serializers.CharField(read_only=True)
    entidade_id = serializers.CharField(read_only=True)
    lida_em = serializers.DateTimeField(read_only=True)
    criado_em = serializers.DateTimeField(read_only=True)


class TotalSerializer(serializers.Serializer):
    """Resposta dos contadores - o selo do sino e a baixa em lote."""

    total = serializers.IntegerField(read_only=True)
