"""
Conta os Demandantes Externos sem empresa vinculada.

    python manage.py demandantes_sem_empresa

Somente leitura. Roda antes do deploy do cadastro com CNPJ: cada conta listada
precisa que o Administrador complete a empresa pela edicao, ou o Demandante
entra e nao consegue cadastrar problema.
"""
from django.core.management.base import BaseCommand

from apps.accounts.models import Papel, Usuario


class Command(BaseCommand):
    help = 'Conta os Demandantes Externos sem empresa vinculada (somente leitura).'

    def handle(self, *args, **options):
        sem_empresa = Usuario.objects.filter(
            papel=Papel.DEMANDANTE, organizacao__isnull=True
        ).order_by('id_usuario')

        total = sem_empresa.count()
        self.stdout.write(f'Demandantes sem empresa vinculada: {total}')

        for usuario in sem_empresa:
            self.stdout.write(f'  conta {usuario.id_usuario}')
