"""
Mede a pertinencia do matching numa amostra rotulada pela AC2 (SPEC-16).

    python manage.py medir_pertinencia caminho/amostra.json
    python manage.py medir_pertinencia caminho/amostra.json --sem-afinidade

A amostra e um JSON com um caso por oportunidade e o numero (`id_membro`) de
cada pessoa da rede que a AC2 considera pertinente:

    {"descricao": "...", "casos": [{"oportunidade": "OP-2026-001", "pertinentes": [3, 7]}]}

Roda so contra banco local, com dados ficticios ou anonimizados (AGENTS.md
0.1). Nao grava nada. `--sem-afinidade` mede o calculo de antes da SPEC-13,
para comparar o antes e o depois.
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.matching.services.pertinencia import MedirPertinenciaService
from core.exceptions import ConflitoDeEstado
from core.management.commands.semear_dev import exigir_banco_local


def _porcento(valor: float) -> str:
    return f'{valor:.0%}'


class Command(BaseCommand):
    help = 'Mede a pertinência do matching numa amostra rotulada pela AC2.'

    def add_arguments(self, parser):
        parser.add_argument('amostra', help='Arquivo JSON da amostra rotulada.')
        parser.add_argument(
            '--sem-afinidade',
            action='store_true',
            help='Mede sem a afinidade com o tema, como antes da SPEC-13.',
        )

    def handle(self, *args, **options):
        exigir_banco_local()
        caminho = Path(options['amostra'])

        if not caminho.is_file():
            raise CommandError(f'Amostra não encontrada: {caminho}.')

        try:
            amostra = json.loads(caminho.read_text(encoding='utf-8'))
        except json.JSONDecodeError as erro:
            raise CommandError(f'A amostra {caminho} não é um JSON válido: {erro}.') from erro

        try:
            resultado = MedirPertinenciaService().execute(
                amostra=amostra, sem_afinidade=options['sem_afinidade']
            )
        except ConflitoDeEstado as erro:
            raise CommandError(erro.detalhe) from erro

        for caso in resultado.casos:
            self.stdout.write(
                f'{caso.codigo}: {caso.pertinentes_sugeridos} de {caso.sugeridos} '
                f'sugestões pertinentes ({_porcento(caso.pertinencia)})'
            )

        self.stdout.write(
            f'Pertinência total: {resultado.pertinentes_sugeridos} de '
            f'{resultado.sugeridos} sugestões ({_porcento(resultado.pertinencia)}). '
            f'Meta: {_porcento(resultado.meta)}.'
        )
        self.stdout.write(
            'Cálculo com a afinidade com o tema.'
            if resultado.com_afinidade
            else 'Cálculo sem a afinidade com o tema: a nota usa as outras três parcelas.'
        )
