"""
Confere a situacao das oportunidades contra o que ja existe em cada uma.

    python manage.py conferir_situacoes            # so lista
    python manage.py conferir_situacoes --aplicar  # grava os ajustes

Antes da regra do fluxo as etapas nao mexiam na situacao: uma oportunidade com
pre-analise pronta podia estar em Entrada, e a decisao Continuar ficaria
recusada. O ajuste so anda para a frente e nao toca em decisao registrada.

Grava dados com `--aplicar`: por padrao so contra banco local (AGENTS.md 0.1).
Em banco remoto, so a pedido explicito, depois do backup, com `--banco-remoto`.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.opportunities.models import Oportunidade
from apps.opportunities.services.fluxo import (
    ETAPAS_EM_CURSO,
    ajustar_pelos_dados,
    ajuste_pelos_dados,
)
from core.management.commands.semear_dev import exigir_banco_local


class Command(BaseCommand):
    help = 'Confere e, com --aplicar, ajusta a situação das oportunidades em curso.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--aplicar', action='store_true', help='Grava os ajustes encontrados.'
        )
        parser.add_argument(
            '--banco-remoto',
            action='store_true',
            help='Permite gravar num banco que não é local. Só depois do backup.',
        )

    def handle(self, *args, **options):
        if options['aplicar'] and not options['banco_remoto']:
            exigir_banco_local()

        em_curso = (
            Oportunidade.objects.filter(situacao__in=ETAPAS_EM_CURSO)
            .select_related('proposta')
            .order_by('codigo')
        )
        ajustes = [
            (oportunidade, devida)
            for oportunidade in em_curso
            if (devida := ajuste_pelos_dados(oportunidade)) is not None
        ]

        for oportunidade, devida in ajustes:
            self.stdout.write(
                f'{oportunidade.codigo}: {oportunidade.get_situacao_display()} -> '
                f'{Oportunidade(situacao=devida).get_situacao_display()}'
            )

        if not options['aplicar']:
            self.stdout.write(
                f'{len(ajustes)} oportunidade(s) fora da regra. '
                'Nada foi gravado; rode com --aplicar para ajustar.'
            )
            return

        ajustadas = 0

        for oportunidade, _ in ajustes:
            with transaction.atomic():
                ajustadas += ajustar_pelos_dados(oportunidade) is not None

        self.stdout.write(f'{ajustadas} oportunidade(s) ajustada(s).')
