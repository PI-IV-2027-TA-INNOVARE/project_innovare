"""
Middlewares do projeto: o limite de tamanho do pedido e a medicao (plano 5.2).

O medidor mede e segue. Qualquer falha nele e engolida de proposito: um
contador de observabilidade que derruba a resposta e pior que nao ter contador.
"""
from __future__ import annotations

import math
import time

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.urls import Resolver404, resolve, reverse

from core.limites import LimiteDeEntradaNoAdmin
from core.medicao import espera_de_ia_ms, medidor, zerar_espera_de_ia

PREFIXO_MEDIDO = '/api/'

ROTA_DE_ANEXOS = 'oportunidade-anexos'
ENVELOPE_DO_ANEXO_BYTES = 64 * 1024


class LimiteDeCorpo:
    """
    Recusa o pedido maior que o permitido antes de ler o corpo.

    O Django so barrava o JSON acima de 2,5 MB, e barrava com erro 500, que
    enchia o log; o envio de arquivo nao tinha teto nenhum antes de chegar
    inteiro ao disco. Aqui quem decide e o tamanho declarado, e nada do corpo
    e lido.

    A rota de anexos tem o limite do anexo, com folga para o envelope do
    envio; o tamanho exato do arquivo continua conferido no servico.
    """

    def __init__(self, get_response) -> None:
        self._get_response = get_response

    def __call__(self, request):
        declarado = self._tamanho_declarado(request)

        if not declarado:
            return self._get_response(request)

        if self._e_envio_de_anexo(request):
            megas = settings.ANEXO_TAMANHO_MAXIMO_MB
            limite = megas * 1024 * 1024 + ENVELOPE_DO_ANEXO_BYTES
            mensagem = f'Arquivo acima de {megas} MB.'
        else:
            limite = settings.CORPO_MAXIMO_KB * 1024
            mensagem = 'O conteúdo enviado é maior do que o permitido.'

        if declarado > limite:
            return JsonResponse(
                {'detail': mensagem, 'codigo': 'corpo_grande_demais'}, status=413
            )

        return self._get_response(request)

    @staticmethod
    def _tamanho_declarado(request) -> int:
        try:
            return int(request.META.get('CONTENT_LENGTH') or 0)
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _e_envio_de_anexo(request) -> bool:
        try:
            return resolve(request.path_info).url_name == ROTA_DE_ANEXOS
        except Resolver404:
            return False


class TravaDoAdmin:
    """
    Limite de tentativas de senha no `/admin/` do Django.

    A tela de entrada do admin nao e rota do DRF, e nenhum dos limites da API
    a alcancava: aceitava tentativa de senha sem fim. So o envio do formulario
    conta; abrir a tela, nao.
    """

    def __init__(self, get_response) -> None:
        self._get_response = get_response

    def __call__(self, request):
        if request.method == 'POST' and request.path == reverse('admin:login'):
            limite = LimiteDeEntradaNoAdmin()

            if not limite.allow_request(request, None):
                resposta = HttpResponse(
                    'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.',
                    status=429,
                    content_type='text/plain; charset=utf-8',
                )
                espera = limite.wait()

                if espera:
                    resposta['Retry-After'] = str(math.ceil(espera))

                return resposta

        return self._get_response(request)


class MedidorDeDesempenho:
    """
    Latencia por requisicao da API, em memoria, sem tocar o banco.

    A espera por servico externo de IA sai da conta: o criterio dos 3 s a
    desconsidera (`CONTEXT.md` secao 6).
    """

    def __init__(self, get_response) -> None:
        self._get_response = get_response

    def __call__(self, request):
        if not request.path.startswith(PREFIXO_MEDIDO):
            return self._get_response(request)

        zerar_espera_de_ia()
        inicio = time.perf_counter()
        resposta = self._get_response(request)

        try:
            total_ms = (time.perf_counter() - inicio) * 1000
            medidor().registrar(
                duracao_ms=max(total_ms - espera_de_ia_ms(), 0),
                status=getattr(resposta, 'status_code', 0),
            )
        except Exception:
            pass

        return resposta
