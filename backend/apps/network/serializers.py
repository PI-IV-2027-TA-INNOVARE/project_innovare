"""
Contrato da rede interna (RF02, RF03).

O vocabulario e o do cliente: membro da rede, titulacao, competencia, tecnica,
linha de pesquisa, disponibilidade.
"""
from django.utils import timezone
from rest_framework import serializers

from apps.network.models import (
    Competencia,
    Formacao,
    MembroRede,
    PapelNaRede,
    TipoCompetencia,
    Titulacao,
)


class TitulacaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Titulacao
        fields = ['id_titulacao', 'codigo', 'rotulo', 'nivel']


class CompetenciaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Competencia
        fields = ['id_competencia', 'nome', 'tipo']


class FormacaoSerializer(serializers.ModelSerializer):
    """Um curso concluido ou em andamento (PB11 / Escopo 3.3)."""

    titulacao_codigo = serializers.SlugRelatedField(
        source='titulacao',
        slug_field='codigo',
        queryset=Titulacao.objects.all(),
        required=False,
        allow_null=True,
    )
    titulacao_rotulo = serializers.CharField(
        source='titulacao.rotulo', read_only=True, default=None
    )
    ano_conclusao = serializers.IntegerField(
        required=False, allow_null=True, min_value=1950
    )

    class Meta:
        model = Formacao
        fields = [
            'id_formacao', 'curso', 'instituicao',
            'titulacao_codigo', 'titulacao_rotulo', 'ano_conclusao',
        ]
        read_only_fields = ['id_formacao']

    def validate_ano_conclusao(self, valor):
        limite = timezone.now().year + 10

        if valor is not None and valor > limite:
            raise serializers.ValidationError(
                f'Ano de conclusão acima de {limite}.'
            )

        return valor


class ListaDeNomes(serializers.ListField):
    child = serializers.CharField(max_length=160, allow_blank=False)


class MembroRedeSerializer(serializers.ModelSerializer):
    """
    As tres listas aparecem separadas na tela e moram numa tabela so.

    O `tipo` da competencia e o discriminador; o serializer faz a traducao nos
    dois sentidos para a tela nao precisar conhecer a juncao. `nome` e
    `email` tambem sao traducao: moram no membro ou na conta dele, e o
    servico grava cada um no lugar certo.
    """

    nome = serializers.CharField(max_length=160)
    email = serializers.EmailField()

    titulacao_codigo = serializers.SlugRelatedField(
        source='titulacao',
        slug_field='codigo',
        queryset=Titulacao.objects.all(),
        required=False,
        allow_null=True,
    )
    titulacao_rotulo = serializers.CharField(
        source='titulacao.rotulo', read_only=True, default=None
    )
    organizacao_nome = serializers.CharField(
        source='organizacao.nome', read_only=True, default=None
    )
    tem_acesso = serializers.SerializerMethodField()

    competencias = ListaDeNomes(required=False, write_only=True)
    tecnicas = ListaDeNomes(required=False, write_only=True)
    linhas = ListaDeNomes(required=False, write_only=True)
    formacoes = FormacaoSerializer(many=True, required=False)

    class Meta:
        model = MembroRede
        fields = [
            'id_membro', 'nome', 'email', 'papel_rede',
            'titulacao_codigo', 'titulacao_rotulo',
            'organizacao', 'organizacao_nome',
            'disponibilidade', 'experiencia', 'situacao',
            'competencias', 'tecnicas', 'linhas', 'formacoes', 'tem_acesso',
            'criado_em', 'atualizado_em',
        ]
        read_only_fields = ['id_membro', 'situacao', 'criado_em', 'atualizado_em']

    def get_tem_acesso(self, membro) -> bool:
        return membro.usuario_id is not None

    def _nomes(self, membro, tipo):
        return [
            vinculo.competencia.nome
            for vinculo in membro.vinculos_competencia.all()
            if vinculo.competencia.tipo == tipo
        ]

    def to_representation(self, membro):
        """
        As tres listas sao `write_only` no campo e voltam aqui na leitura.

        Escrever e ler pelo mesmo nome, sem que `competencias` colida com o M2M
        homonimo do modelo, que o DRF tentaria serializar como manager.
        """
        dados = super().to_representation(membro)
        dados['competencias'] = self._nomes(membro, TipoCompetencia.COMPETENCIA)
        dados['tecnicas'] = self._nomes(membro, TipoCompetencia.TECNICA)
        dados['linhas'] = self._nomes(membro, TipoCompetencia.LINHA_PESQUISA)
        return dados

    def validate_email(self, valor):
        return valor.strip().lower()

    def validate_papel_rede(self, valor):
        # RN-A03 / RN-A04: Supervisor cadastra apenas Pesquisadores
        if valor != PapelNaRede.PESQUISADOR:
            raise serializers.ValidationError('O Supervisor só pode cadastrar Pesquisadores.')
        return valor


class PerfilProprioSerializer(MembroRedeSerializer):
    """
    RN-A05: o Pesquisador mantem o proprio perfil *dentro dos campos
    definidos*. Nome, e-mail, papel na rede e situacao nao estao entre eles -
    mexer neles e cadastro, e cadastro e do Supervisor (RN-A04).
    """

    nome = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)

    class Meta(MembroRedeSerializer.Meta):
        read_only_fields = [
            'id_membro', 'papel_rede', 'organizacao',
            'situacao', 'criado_em', 'atualizado_em',
        ]


class LiberarAcessoSerializer(serializers.Serializer):
    """Sem corpo: quem libera o acesso e a rota, o membro ja tem os dados."""
