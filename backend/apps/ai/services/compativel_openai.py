"""
Gateway das APIs compativeis com a da OpenAI (SPEC-23).

Groq, OpenRouter, OpenAI, DeepSeek, Mistral e os servidores locais como Ollama
e LM Studio aceitam o mesmo `POST /chat/completions`. Um provedor desses entra
pelo `.env`, sem codigo: o nome em `AI_PROVEDORES_COMPATIVEIS` e, para cada
nome, a chave, o endereco e o modelo (`registro.py` monta o descritor).

A conversa e pelo `httpx`, que ja vem com a `google-genai`: dependencia nova e
portao de decisao (AGENTS.md 3.2). O resto - registro da execucao, tentativas,
JSON e fallback - e o do `GatewayDeIA`, o mesmo do Gemini.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from django.conf import settings

from apps.ai.services.gemini_service import GatewayDeIA


class RespostaForaDoContrato(Exception):
    """O provedor respondeu sem o texto que o contrato promete."""


@dataclass(frozen=True)
class UsoDaChamada:
    """Os tokens que o provedor informou, nos nomes que o gateway le."""

    prompt_token_count: int | None
    candidates_token_count: int | None
    thoughts_token_count: int = 0


@dataclass(frozen=True)
class RespostaDaChamada:
    text: str
    usage_metadata: UsoDaChamada | None


def ler_resposta(corpo: Any) -> RespostaDaChamada:
    """
    O texto e os tokens da resposta, na forma que o gateway le.

    Sem `choices[0].message.content` em texto, a resposta nao serve: erro claro
    em vez de JSON vazio, e a operacao segue para a reserva ou para o fallback.
    """
    try:
        texto = corpo['choices'][0]['message']['content']
    except (KeyError, IndexError, TypeError) as erro:
        raise RespostaForaDoContrato(
            'Resposta sem choices[0].message.content.'
        ) from erro

    if not isinstance(texto, str):
        raise RespostaForaDoContrato('choices[0].message.content nao e texto.')

    uso = corpo.get('usage')

    if not isinstance(uso, dict):
        return RespostaDaChamada(text=texto, usage_metadata=None)

    return RespostaDaChamada(
        text=texto,
        usage_metadata=UsoDaChamada(
            prompt_token_count=uso.get('prompt_tokens'),
            candidates_token_count=uso.get('completion_tokens'),
        ),
    )


class ClienteCompativelComOpenAI:
    """
    O `POST /chat/completions` atras da forma de chamada que o gateway usa.

    `transporte` substitui a rede do `httpx`: e o que deixa o teste ver o
    pedido sem abrir socket (AGENTS.md 0.1).
    """

    def __init__(
        self,
        *,
        url_base: str,
        api_key: str,
        modelo: str,
        temperatura: float,
        transporte: httpx.BaseTransport | None = None,
    ) -> None:
        self._url = f'{url_base.rstrip("/")}/chat/completions'
        self._cabecalhos = {'Authorization': f'Bearer {api_key}'}
        self._modelo = modelo
        self._temperatura = temperatura
        self._transporte = transporte

    def generate_content(
        self, prompt: str, *, request_options: dict, sistema: str = ''
    ) -> RespostaDaChamada:
        mensagens = [{'role': 'system', 'content': sistema}] if sistema else []
        mensagens.append({'role': 'user', 'content': prompt})

        with httpx.Client(
            transport=self._transporte, timeout=float(request_options['timeout'])
        ) as cliente:
            resposta = cliente.post(
                self._url,
                headers=self._cabecalhos,
                json={
                    'model': self._modelo,
                    'messages': mensagens,
                    'temperature': self._temperatura,
                    'max_tokens': settings.AI_GEMINI_MAX_TOKENS_SAIDA,
                    'response_format': {'type': 'json_object'},
                },
            )

        resposta.raise_for_status()

        try:
            corpo = resposta.json()
        except ValueError as erro:
            raise RespostaForaDoContrato('Resposta que nao e JSON.') from erro

        return ler_resposta(corpo)


class ProvedorCompativelComOpenAI(GatewayDeIA):
    """
    Um provedor do catalogo: o nome e as settings vem do registro.

    O tempo maximo, as tentativas e o teto de saida sao os do Gemini
    (`AI_GEMINI_*`), que valem para todos. O limite de raciocinio nao: e
    parametro so do Gemini.
    """

    def __init__(
        self,
        *,
        nome: str,
        chave_setting: str,
        modelo_setting: str,
        url_setting: str,
        transporte: httpx.BaseTransport | None = None,
        **kwargs,
    ) -> None:
        self.provedor = nome
        self.chave_setting = chave_setting
        self.modelo_setting = modelo_setting
        self._url_setting = url_setting
        self._transporte = transporte
        super().__init__(**kwargs)

    def _criar_cliente(
        self, *, api_key: str, temperatura: float, orcamento_raciocinio: int | None
    ) -> ClienteCompativelComOpenAI | None:
        url_base = str(getattr(settings, self._url_setting, '') or '')

        if not url_base:
            return None

        return ClienteCompativelComOpenAI(
            url_base=url_base,
            api_key=api_key,
            modelo=self._modelo,
            temperatura=temperatura,
            transporte=self._transporte,
        )
