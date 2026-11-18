"""
Registro de provedores de IA (SPEC-23).

O provedor é configuração, não import espalhado. Quem consome pede o principal
ao registro; o `.env` decide qual é, qual é o modelo e quais são os preços.
Assim, trocar de provedor não exige editar os casos de uso - e a chave continua
só no servidor.

O registro também é o lugar da **fila de reservas**. `AI_PROVEDOR_RESERVA` é uma
lista separada por vírgula: quando o principal falha (provedor indisponível,
erro ou resposta malformada), a operação tenta cada reserva uma vez, na ordem,
e a primeira que responde encerra a fila. O teto de gasto é a exceção: ele vale
para todos os provedores, então estouro de limite não vira nova tentativa.

Há dois jeitos de um provedor entrar. O que tem SDK próprio, como o Gemini,
entra por código: um adaptador que cumpra `ProvedorDeIA` e uma linha aqui. O
compatível com a API da OpenAI (Groq, OpenRouter, Ollama...) entra pelo `.env`,
no catálogo `AI_PROVEDORES_COMPATIVEIS`. Dependência nova e tratamento de dados
pessoais continuam sendo portões de decisão (AGENTS.md 3.2).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import partial
from typing import Any, Callable, Sequence

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from apps.ai.models import StatusExecucao
from apps.ai.services.custo import (
    MOTIVO_FALHA_DO_PROVEDOR,
    MOTIVO_MODELO_DE_RESERVA,
    MOTIVO_SEM_IA,
)
from apps.ai.services.protocolos import ProvedorDeIA
from apps.ai.services.teto import ProvedorComTetoDeCusto


@dataclass(frozen=True)
class ProvedorRegistrado:
    """O que o registro sabe de um provedor, sem instanciá-lo."""

    nome: str
    rotulo: str
    fabrica: Callable[..., ProvedorDeIA]
    chave_setting: str
    modelo_setting: str
    preco_entrada_setting: str
    preco_saida_setting: str
    exige: tuple[str, ...] = ()
    gratuito_setting: str = ''

    def criar(self, **kwargs) -> ProvedorDeIA:
        return self.fabrica(**kwargs)

    def gratuito(self) -> bool:
        """Preco zero conferido, e nao tabela ausente: o custo e apurado como R$ 0,00."""
        return bool(self.gratuito_setting and getattr(settings, self.gratuito_setting, False))

    def configurado(self) -> bool:
        return all(
            getattr(settings, setting, '')
            for setting in (self.chave_setting, *self.exige)
        )

    def modelo(self) -> str:
        return str(getattr(settings, self.modelo_setting, '') or '')

    def precos(self) -> tuple[float, float]:
        return (
            float(getattr(settings, self.preco_entrada_setting, 0) or 0),
            float(getattr(settings, self.preco_saida_setting, 0) or 0),
        )


_REGISTRO: dict[str, ProvedorRegistrado] = {}


def registrar(provedor: ProvedorRegistrado) -> None:
    """Registra (ou substitui) um provedor pelo nome."""
    _REGISTRO[provedor.nome] = provedor


def desregistrar(nome: str) -> None:
    """Remove um provedor - usado pelo teste que registra um duble."""
    _REGISTRO.pop(nome, None)


NOME_DO_CATALOGO = re.compile(r'[a-z][a-z0-9_]{0,39}')


def _lista(valor: str | Sequence[str] | None) -> list[str]:
    """Texto separado por vírgula ou lista, sem espaços nem itens vazios."""
    itens = valor.split(',') if isinstance(valor, str) else (valor or [])

    return [str(item).strip() for item in itens if str(item).strip()]


def _criar_compativel(**kwargs) -> ProvedorDeIA:
    from apps.ai.services.compativel_openai import ProvedorCompativelComOpenAI

    return ProvedorCompativelComOpenAI(**kwargs)


def descritor_do_catalogo(nome: str) -> ProvedorRegistrado:
    """
    O provedor compatível com a OpenAI que o `.env` declara pelo nome.

    As settings saem do prefixo: `groq` lê `GROQ_API_KEY`, `AI_GROQ_URL`,
    `AI_GROQ_MODELO`, `AI_GROQ_ROTULO`, `AI_GROQ_CUSTO_*_BRL_POR_MILHAO` e
    `AI_GROQ_GRATUITO`.
    Nome fora do padrão ou repetido de um provedor do código é erro de
    configuração: a falha aparece na subida, e não na primeira chamada.
    """
    if not NOME_DO_CATALOGO.fullmatch(nome):
        raise ImproperlyConfigured(
            f'Provedor de IA "{nome}" em AI_PROVEDORES_COMPATIVEIS: use letras '
            'minúsculas, dígitos e sublinhado, começando por letra.'
        )

    if nome in _REGISTRO:
        raise ImproperlyConfigured(
            f'Provedor de IA "{nome}" em AI_PROVEDORES_COMPATIVEIS já existe no '
            'registro. Escolha outro nome.'
        )

    prefixo = nome.upper()
    chave = f'{prefixo}_API_KEY'
    modelo = f'AI_{prefixo}_MODELO'
    url = f'AI_{prefixo}_URL'

    return ProvedorRegistrado(
        nome=nome,
        rotulo=str(getattr(settings, f'AI_{prefixo}_ROTULO', '') or nome),
        fabrica=partial(
            _criar_compativel,
            nome=nome,
            chave_setting=chave,
            modelo_setting=modelo,
            url_setting=url,
        ),
        chave_setting=chave,
        modelo_setting=modelo,
        preco_entrada_setting=f'AI_{prefixo}_CUSTO_ENTRADA_BRL_POR_MILHAO',
        preco_saida_setting=f'AI_{prefixo}_CUSTO_SAIDA_BRL_POR_MILHAO',
        exige=(url, modelo),
        gratuito_setting=f'AI_{prefixo}_GRATUITO',
    )


def _todos() -> dict[str, ProvedorRegistrado]:
    """Os do código e, depois deles, os do catálogo, lido a cada vez das settings."""
    catalogo = _lista(getattr(settings, 'AI_PROVEDORES_COMPATIVEIS', ''))

    return {**_REGISTRO, **{nome: descritor_do_catalogo(nome) for nome in catalogo}}


def descritor(nome: str) -> ProvedorRegistrado:
    """O descritor do provedor, ou erro de configuração com nome e chave."""
    todos = _todos()

    try:
        return todos[nome]
    except KeyError as erro:
        conhecidos = ', '.join(sorted(todos)) or 'nenhum'
        raise ImproperlyConfigured(
            f'Provedor de IA "{nome}" não está registrado. '
            f'Registrados: {conhecidos}.'
        ) from erro


def descritores() -> tuple[ProvedorRegistrado, ...]:
    """Todos os provedores registrados, na ordem de registro."""
    return tuple(_todos().values())


def nome_do_principal() -> str:
    return str(getattr(settings, 'AI_PROVEDOR_PRINCIPAL', 'google') or 'google')


def nomes_das_reservas() -> list[str]:
    return _lista(getattr(settings, 'AI_PROVEDOR_RESERVA', ''))


def _reservas_configuradas() -> list[tuple[ProvedorRegistrado, str | None]]:
    """
    A fila de reservas: cada descritor com o modelo que ele deve usar.

    `AI_MODELO_RESERVA` vale para a primeira reserva - ou, sem provedor de
    reserva, para o próprio principal com outro modelo. O modelo `None` é o
    do `.env` do provedor. Par repetido, e o par do principal, não é reserva.
    """
    principal = descritor(nome_do_principal())
    modelo_reserva = str(getattr(settings, 'AI_MODELO_RESERVA', '') or '')
    nomes = nomes_das_reservas() or ([principal.nome] if modelo_reserva else [])
    vistos = {(principal.nome, principal.modelo())}
    fila = []

    for posicao, nome in enumerate(nomes):
        reserva = descritor(nome)
        modelo = modelo_reserva if posicao == 0 and modelo_reserva else None
        par = (reserva.nome, modelo or reserva.modelo())

        if par in vistos:
            continue

        vistos.add(par)
        fila.append((reserva, modelo))

    return fila


def papeis_configurados() -> dict[tuple[str, str], str]:
    """
    Os pares de provedor e modelo que a configuração põe para responder.

    Na ordem em que respondem: o principal e depois a fila de reservas. A
    regra da fila é a de `provedor_com_reserva`.
    """
    principal = descritor(nome_do_principal())
    papeis = {(principal.nome, principal.modelo()): 'principal'}

    for reserva, modelo in _reservas_configuradas():
        papeis[(reserva.nome, modelo or reserva.modelo())] = 'reserva'

    return papeis


def provedor_principal(**kwargs) -> ProvedorDeIA:
    """O provedor principal, criado com a configuração do ambiente e com o teto de gasto."""
    return ProvedorComTetoDeCusto(descritor(nome_do_principal()).criar(**kwargs))


def provedor_com_reserva(**kwargs) -> ProvedorDeIA:
    """
    O principal com a fila de reservas, todos sob o mesmo teto de gasto.

    Sem reserva - nem provedor, nem modelo alternativo - devolve o principal
    sem o `ProvedorComReserva`: uma camada que não faz nada só esconde a
    chamada. O teto embrulha o conjunto uma vez, antes de qualquer chamada.
    """
    principal = descritor(nome_do_principal()).criar(**kwargs)
    fila = _reservas_configuradas()

    if not fila:
        return ProvedorComTetoDeCusto(principal)

    reservas = [
        reserva.criar(**({**kwargs, 'modelo': modelo} if modelo else kwargs))
        for reserva, modelo in fila
    ]

    return ProvedorComTetoDeCusto(
        ProvedorComReserva(principal=principal, reservas=reservas)
    )


class ProvedorComReserva:
    """
    Executa no principal e, se ele falhar, tenta cada reserva uma vez, na ordem.

    A reserva só entra nas falhas do provedor. Limite de gasto e saída inválida
    de regra de negócio não são "tente outro modelo": o primeiro vale para
    todos, e a segunda não melhora com uma segunda opinião.
    """

    def __init__(
        self, *, principal: ProvedorDeIA, reservas: Sequence[ProvedorDeIA]
    ) -> None:
        self._principal = principal
        self._reservas = list(reservas)

    @property
    def disponivel(self) -> bool:
        return any(
            getattr(provedor, 'disponivel', False)
            for provedor in (self._principal, *self._reservas)
        )

    def _deve_tentar_reserva(self, resultado: dict[str, Any]) -> bool:
        motivo = resultado.get('motivo_fallback')

        if resultado.get('fallback_usado') and motivo in (
            MOTIVO_SEM_IA,
            MOTIVO_FALHA_DO_PROVEDOR,
        ):
            return True

        execucao = resultado.get('execucao_ia')

        if execucao is not None and getattr(execucao, 'status', None) == StatusExecucao.ERRO:
            return True

        return bool((resultado.get('dados') or {}).get('_erro_parse'))

    def _executar(self, operacao: str, **kwargs) -> dict[str, Any]:
        try:
            resultado = getattr(self._principal, operacao)(**kwargs)
        except Exception:
            resultado = None

        if resultado is not None and not self._deve_tentar_reserva(resultado):
            return resultado

        ultima = self._reservas[-1]

        for reserva in self._reservas:
            try:
                resultado = getattr(reserva, operacao)(**kwargs)
            except Exception:
                if reserva is ultima:
                    raise
                continue

            if reserva is ultima or not self._deve_tentar_reserva(resultado):
                break

        if resultado.get('fallback_usado'):
            return resultado

        return {
            **resultado,
            'fallback_usado': True,
            'motivo_fallback': MOTIVO_MODELO_DE_RESERVA,
        }

    def sintetizar_entrada(self, **kwargs) -> dict[str, Any]:
        return self._executar('sintetizar_entrada', **kwargs)

    def estruturar_proposta(self, **kwargs) -> dict[str, Any]:
        return self._executar('estruturar_proposta', **kwargs)

    def derivar_competencias(self, **kwargs) -> dict[str, Any]:
        return self._executar('derivar_competencias', **kwargs)

    def executar_matching(self, **kwargs) -> dict[str, Any]:
        return self._executar('executar_matching', **kwargs)

    def pre_analise_pipe(self, **kwargs) -> dict[str, Any]:
        return self._executar('pre_analise_pipe', **kwargs)


def _criar_gemini(**kwargs) -> ProvedorDeIA:
    from apps.ai.services.gemini_service import ProvedorGemini

    return ProvedorGemini(**kwargs)


registrar(
    ProvedorRegistrado(
        nome='google',
        rotulo='Google Gemini',
        fabrica=_criar_gemini,
        chave_setting='GEMINI_API_KEY',
        modelo_setting='AI_MATCH_GEMINI_MODEL',
        preco_entrada_setting='AI_CUSTO_ENTRADA_BRL_POR_MILHAO',
        preco_saida_setting='AI_CUSTO_SAIDA_BRL_POR_MILHAO',
    )
)


def precos_do_provedor(nome: str | None = None) -> tuple[float, float]:
    """Os preços do provedor, ou do principal quando o nome não é dado."""
    return descritor(nome or nome_do_principal()).precos()


def provedor_gratuito(nome: str) -> bool:
    return descritor(nome).gratuito()


def provedor_configurado(nome: str | None = None) -> bool:
    return descritor(nome or nome_do_principal()).configurado()


def modelo_do_provedor(nome: str | None = None) -> str:
    return descritor(nome or nome_do_principal()).modelo()
