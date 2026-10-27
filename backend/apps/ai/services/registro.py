"""
Registro de provedores de IA (SPEC-23).

O provedor é configuração, não import espalhado. Quem consome pede o principal
ao registro; o `.env` decide qual é, qual é o modelo e quais são os preços.
Assim, trocar de provedor não exige editar os casos de uso - e a chave continua
só no servidor.

O registro também é o lugar do **modelo de reserva**. Quando o principal falha
(provedor indisponível, erro ou resposta malformada), a operação tenta a reserva
uma vez. O teto de gasto é a exceção: ele vale para todos os provedores, então
estouro de limite não vira nova tentativa.

Para um provedor novo, basta um adaptador que cumpra `ProvedorDeIA` e uma linha
no registro. Dependência nova e tratamento de dados pessoais continuam sendo
portões de decisão (AGENTS.md 3.2).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from apps.ai.models import StatusExecucao
from apps.ai.services.custo import (
    MOTIVO_FALHA_DO_PROVEDOR,
    MOTIVO_MODELO_DE_RESERVA,
    MOTIVO_SEM_IA,
)
from apps.ai.services.protocolos import ProvedorDeIA


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

    def criar(self, **kwargs) -> ProvedorDeIA:
        return self.fabrica(**kwargs)

    def configurado(self) -> bool:
        return bool(getattr(settings, self.chave_setting, ''))

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


def descritor(nome: str) -> ProvedorRegistrado:
    """O descritor do provedor, ou erro de configuração com nome e chave."""
    try:
        return _REGISTRO[nome]
    except KeyError as erro:
        conhecidos = ', '.join(sorted(_REGISTRO)) or 'nenhum'
        raise ImproperlyConfigured(
            f'Provedor de IA "{nome}" não está registrado. '
            f'Registrados: {conhecidos}.'
        ) from erro


def descritores() -> tuple[ProvedorRegistrado, ...]:
    """Todos os provedores registrados, na ordem de registro."""
    return tuple(_REGISTRO.values())


def nome_do_principal() -> str:
    return str(getattr(settings, 'AI_PROVEDOR_PRINCIPAL', 'google') or 'google')


def nome_da_reserva() -> str:
    return str(getattr(settings, 'AI_PROVEDOR_RESERVA', '') or '')


def papel_do_provedor(nome: str) -> str:
    """`principal`, `reserva` ou `registrado` - o que a tela de saúde mostra."""
    if nome == nome_do_principal():
        return 'principal'

    if nome == nome_da_reserva():
        return 'reserva'

    return 'registrado'


def provedor_principal(**kwargs) -> ProvedorDeIA:
    """O provedor principal, criado com a configuração do ambiente."""
    return descritor(nome_do_principal()).criar(**kwargs)


def provedor_de_reserva(**kwargs) -> ProvedorDeIA | None:
    """O provedor de reserva, ou `None` quando não há reserva configurada."""
    nome = nome_da_reserva()

    if not nome:
        return None

    return descritor(nome).criar(**kwargs)


def provedor_com_reserva(**kwargs) -> ProvedorDeIA:
    """
    O principal com a reserva configurada.

    Sem reserva - nem provedor, nem modelo alternativo - devolve o principal
    direto, sem wrapper: uma camada que não faz nada só esconde a chamada.
    """
    principal_descritor = descritor(nome_do_principal())
    principal = principal_descritor.criar(**kwargs)
    reserva_nome = nome_da_reserva()
    modelo_reserva = str(getattr(settings, 'AI_MODELO_RESERVA', '') or '')

    if not reserva_nome and not modelo_reserva:
        return principal

    reserva_descritor = (
        descritor(reserva_nome) if reserva_nome else principal_descritor
    )
    reserva_kwargs = dict(kwargs)

    if modelo_reserva:
        reserva_kwargs['modelo'] = modelo_reserva

    reserva = reserva_descritor.criar(**reserva_kwargs)

    if (
        not modelo_reserva
        and reserva_descritor.nome == principal_descritor.nome
        and getattr(reserva, 'modelo', None) == getattr(principal, 'modelo', None)
    ):
        return principal

    return ProvedorComReserva(principal=principal, reserva=reserva)


class ProvedorComReserva:
    """
    Executa no principal e, se ele falhar, tenta a reserva uma vez.

    A reserva só entra nas falhas do provedor. Limite de gasto e saída inválida
    de regra de negócio não são "tente outro modelo": o primeiro vale para
    todos, e a segunda não melhora com uma segunda opinião.
    """

    def __init__(self, *, principal: ProvedorDeIA, reserva: ProvedorDeIA) -> None:
        self._principal = principal
        self._reserva = reserva

    @property
    def disponivel(self) -> bool:
        return bool(
            getattr(self._principal, 'disponivel', False)
            or getattr(self._reserva, 'disponivel', False)
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

        resultado_reserva = getattr(self._reserva, operacao)(**kwargs)

        if resultado_reserva.get('fallback_usado'):
            return resultado_reserva

        return {
            **resultado_reserva,
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


def provedor_configurado(nome: str | None = None) -> bool:
    return descritor(nome or nome_do_principal()).configurado()


def modelo_do_provedor(nome: str | None = None) -> str:
    return descritor(nome or nome_do_principal()).modelo()
