"""
Mede o tempo da estruturacao do Copiloto no Gemini, fora da suite.

    python manage.py medir_estruturacao --rodadas 10
    python manage.py medir_estruturacao --rodadas 10 --raciocinio -1

Chama o Gemini de verdade, com a chave do `.env`: nunca roda na suite
(AGENTS.md 0.1), e cada rodada entra na conta de gasto com IA. O texto enviado
e uma entrada ficticia - nenhum dado de oportunidade sai da maquina.

`--raciocinio -1` deixa o modelo decidir quanto pensar, que era o
comportamento antes do limite; sem a opcao vale `AI_GEMINI_ORCAMENTO_RACIOCINIO`.
A ultima linha sai pronta para a tabela de `IA/PARAMETROS_VIGENTES.md`.

Grava uma execucao de IA por rodada: por padrao roda so contra banco local.
"""
from __future__ import annotations

import statistics
import time
import uuid
from typing import Any, Callable

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.ai.services.registro import (
    descritor,
    nome_do_principal,
    provedor_configurado,
    provedor_principal,
)
from apps.copilot.services.copiloto import ELEMENTOS
from core.management.commands.semear_dev import exigir_banco_local

ENTRADA_FICTICIA = (
    'Fábrica fictícia de sucos para medição de tempo.\n\n'
    'Perdemos lotes de suco de laranja por contaminação que resiste à '
    'pasteurização. Hoje a detecção leva 10 dias, e o lote já saiu. Queremos '
    'detectar em até 48 horas, ainda na linha de envase.'
)


def medir(provedor, *, rodadas: int, relogio: Callable[[], float] = time.perf_counter) -> dict[str, Any]:
    """
    O tempo de cada estruturacao e o resumo das que responderam.

    A rodada que cai no caminho sem IA nao entra na media: ela mede a falha,
    nao o modelo.
    """
    tempos = []
    falhas = 0

    for _ in range(rodadas):
        inicio = relogio()
        resultado = provedor.estruturar_proposta(
            oportunidade_id=None,
            entrada=ENTRADA_FICTICIA,
            sintese='',
            preenchidos={},
            vazios=list(ELEMENTOS),
            respostas=[],
            correlation_id=uuid.uuid4(),
            executado_por='__medicao__',
        )
        decorrido = relogio() - inicio

        if resultado.get('fallback_usado'):
            falhas += 1
            continue

        tempos.append(decorrido)

    return {
        'tempos_s': tempos,
        'falhas': falhas,
        'media_s': statistics.mean(tempos) if tempos else None,
        'mediana_s': statistics.median(tempos) if tempos else None,
    }


class Command(BaseCommand):
    help = 'Mede o tempo médio da estruturação do Copiloto no Gemini (manual, com chave própria).'

    def add_arguments(self, parser):
        parser.add_argument('--rodadas', type=int, default=10)
        parser.add_argument(
            '--raciocinio',
            type=int,
            default=None,
            help='Limite de raciocínio desta medição. -1 deixa o modelo decidir.',
        )
        parser.add_argument(
            '--banco-remoto',
            action='store_true',
            help='Permite gravar as execuções num banco que não é local.',
        )

    def handle(self, *args, **options):
        if not provedor_configurado():
            chave = descritor(nome_do_principal()).chave_setting
            raise CommandError(
                f'Sem {chave} no .env: a medição precisa do Gemini de verdade.'
            )

        if not options['banco_remoto']:
            exigir_banco_local()

        rodadas = max(1, options['rodadas'])
        orcamento = (
            settings.AI_GEMINI_ORCAMENTO_RACIOCINIO
            if options['raciocinio'] is None
            else options['raciocinio']
        )
        provedor = provedor_principal(orcamento_raciocinio=orcamento)

        resultado = medir(provedor, rodadas=rodadas)

        for indice, tempo in enumerate(resultado['tempos_s'], start=1):
            self.stdout.write(f'Rodada {indice}: {tempo:.1f} s')

        if resultado['media_s'] is None:
            self.stdout.write(f'Nenhuma rodada respondeu ({resultado["falhas"]} sem IA).')
            return

        self.stdout.write(
            f'| {timezone.localdate():%d/%m/%Y} | {provedor.modelo} | {orcamento} | '
            f'{len(resultado["tempos_s"])} | {resultado["media_s"]:.1f} s | '
            f'{resultado["mediana_s"]:.1f} s | {resultado["falhas"]} |'
        )
