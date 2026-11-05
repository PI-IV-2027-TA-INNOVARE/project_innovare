"""
Simula ou aplica a retencao de dados pessoais (LGPD, SPEC-17).

    python manage.py aplicar_retencao
    python manage.py aplicar_retencao --aplicar

Sem `--aplicar`, o comando so lista o que venceria. A simulacao nao altera a
trilha, os anexos nem grava evento de auditoria.
"""
from django.core.management.base import BaseCommand

from apps.audit.services.retencao import AplicarRetencaoService


class Command(BaseCommand):
    help = 'Simula ou aplica a retencao de eventos de acesso e anexos.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--aplicar',
            action='store_true',
            help='Executa a retencao. Sem esta opcao, apenas simula.',
        )

    def handle(self, *args, **options):
        aplicar = options['aplicar']
        resultado = AplicarRetencaoService().execute(aplicar=aplicar)

        if resultado.simulado:
            self.stdout.write(
                'Simulação: nada foi alterado. Use --aplicar para executar.'
            )
        else:
            self.stdout.write('Retenção aplicada.')

        self.stdout.write(
            f'Eventos de acesso vencidos: {len(resultado.eventos)}'
        )
        for evento in resultado.eventos:
            self.stdout.write(
                f'  evento {evento.id_evento} {evento.tipo} '
                f'{evento.ocorrido_em:%d/%m/%Y}'
            )

        self.stdout.write(f'Anexos vencidos: {len(resultado.anexos)}')
        for anexo in resultado.anexos:
            self.stdout.write(
                f'  anexo {anexo.id_anexo} {anexo.nome_original} '
                f'({anexo.oportunidade_codigo}, arquivada em '
                f'{anexo.arquivada_em:%d/%m/%Y})'
            )

        if resultado.simulado:
            self.stdout.write('Nada foi gravado na trilha de auditoria.')
