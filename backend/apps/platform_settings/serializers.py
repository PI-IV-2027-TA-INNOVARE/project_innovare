"""Contrato de fronteira da configuracao administravel."""
import re

from rest_framework import serializers
from rest_framework.settings import api_settings

from apps.platform_settings.models import ConfiguracaoPlataforma

TEMAS = ('light', 'dark')

COR_HEX = re.compile(r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$')
COR_RGB = re.compile(
    r'^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*'
    r'(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$'
)
NOME_DE_TOKEN = re.compile(r'^[a-z][a-zA-Z0-9]{0,39}$')


def e_cor(valor):
    """
    Se o valor e uma cor que o navegador aceita numa custom property.

    Hex **e** `rgb()/rgba()`: `accentWarm` e `borderColor` nascem translucidos no
    tema escuro (`rgba(237, 241, 247, 0.14)`), porque alfa nao cabe no hex de
    seis digitos. Aceitar so hex tornaria esses dois tokens impossiveis de
    gravar - e a tela precisa poder devolve-los ao padrao.
    """
    if not isinstance(valor, str):
        return False

    texto = valor.strip()

    return bool(COR_HEX.match(texto) or COR_RGB.match(texto))


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


class TemaPatchSerializer(serializers.Serializer):
    """
    O merge patch da paleta, conferido antes de virar documento publico.

    A paleta e servida pelo GET anonimo e o front a escreve em custom property
    no `document.documentElement`. Valor que nao e cor nao levanta erro no
    navegador: a variavel e descartada e a plataforma perde a cor **para todos**,
    inclusive na tela de login de quem nao tem conta. Logo o valor errado tem de
    morrer aqui, na fronteira (AGENTS.md 1), e nao na tela que o digitou.

    Valida **forma e valor**, nao o inventario: quais tokens existem e
    conhecimento do front (`theme/brandTokens.js`), e repetir a lista aqui
    criaria duas verdades que divergem na primeira cor nova. O que a fronteira
    afirma e mais fraco e mais estavel - "isto e um documento de cores, com dois
    niveis, nomes de token plausiveis e valores em hexadecimal".

    `None` sobrevive a validacao porque e o `null` da RFC 7396: e assim que a
    tela desfaz uma cor.
    """

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError({
                api_settings.NON_FIELD_ERRORS_KEY: [
                    'As alterações precisam vir como um objeto.'
                ]
            })

        desconhecidos = sorted(set(data) - set(TEMAS))

        if desconhecidos:
            raise serializers.ValidationError({
                nome: 'Tema desconhecido. Use "light" ou "dark".'
                for nome in desconhecidos
            })

        erros = {}

        for tema, cores in data.items():
            if not isinstance(cores, dict):
                erros[tema] = 'Cada tema e um objeto de token para cor.'
                continue

            do_tema = {
                token: motivo
                for token, valor in cores.items()
                if (motivo := self._recusa(token, valor))
            }

            if do_tema:
                erros[tema] = do_tema

        if erros:
            raise serializers.ValidationError(erros)

        return data

    def _recusa(self, token, valor):
        """O motivo da recusa, ou `None` quando o par token/cor passa."""
        if not NOME_DE_TOKEN.match(str(token)):
            return 'Nome de cor inválido.'

        if valor is None:
            return None

        if not e_cor(valor):
            return (
                'Informe uma cor: hexadecimal como #1B5E20 ou #f80, '
                'ou rgba() como rgba(224, 123, 26, 0.16).'
            )

        return None


class ContatoSuporteSerializer(serializers.Serializer):
    nome = serializers.CharField(max_length=160)
    email = serializers.EmailField()
    papel = serializers.CharField(max_length=120, allow_blank=True, required=False, default='')


class EncarregadoSerializer(serializers.Serializer):
    nome = serializers.CharField()
    email = serializers.EmailField()


class PrivacidadeSerializer(serializers.Serializer):
    encarregado = EncarregadoSerializer(allow_null=True)
    contatos = ContatoSuporteSerializer(many=True)


def secao_vazia(secao):
    """A resposta de uma secao que ninguem gravou - mesmo formato do serializer."""
    return {
        'secao': secao,
        'payload': {},
        'revisao': 0,
        'atualizado_em': None,
        'atualizado_por_nome': None,
    }
