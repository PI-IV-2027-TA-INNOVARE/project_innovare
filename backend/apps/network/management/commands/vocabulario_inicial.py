"""
Tira a primeira lista de sinonimos do vocabulario da rede atual.

    python manage.py vocabulario_inicial

Liga as competencias que so diferem por acento, maiuscula ou espaco
("Fermentação" e "fermentacao") ao termo mais usado na rede, que vira o
canonico. O resto do vocabulario - "qPCR" e "PCR quantitativo", por exemplo -
e curadoria de quem conhece a area, feita pelo /admin/ em Competencia.

Grava dados: por padrao roda so contra banco local (AGENTS.md 0.1). Em banco
remoto, so a pedido explicito, depois do backup, com `--banco-remoto`.
`--simular` so lista.
"""
import unicodedata
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from apps.network.models import Competencia
from core.management.commands.semear_dev import exigir_banco_local


def forma_normal(nome: str) -> str:
    sem_acento = ''.join(
        caractere
        for caractere in unicodedata.normalize('NFD', nome.lower())
        if unicodedata.category(caractere) != 'Mn'
    )
    return ' '.join(sem_acento.split())


class Command(BaseCommand):
    help = 'Liga ao termo mais usado as competências que só diferem por acento ou maiúscula.'

    def add_arguments(self, parser):
        parser.add_argument('--simular', action='store_true', help='Só lista, não grava.')
        parser.add_argument(
            '--banco-remoto',
            action='store_true',
            help='Permite gravar num banco que não é local. Só depois do backup.',
        )

    def handle(self, *args, **options):
        if not options['simular'] and not options['banco_remoto']:
            exigir_banco_local()

        grupos = defaultdict(list)

        for competencia in Competencia.objects.annotate(usos=Count('vinculos_membro')):
            grupos[(competencia.tipo, forma_normal(competencia.nome))].append(competencia)

        ligacoes = []

        for termos in grupos.values():
            if len(termos) < 2:
                continue

            termos.sort(key=lambda termo: (-termo.usos, termo.nome))
            canonico, *sinonimos = termos
            ligacoes.append((canonico, sinonimos))

        with transaction.atomic():
            for canonico, sinonimos in ligacoes:
                self.stdout.write(
                    f'{canonico.nome} <- ' + ', '.join(termo.nome for termo in sinonimos)
                )

                if options['simular']:
                    continue

                Competencia.objects.filter(pk=canonico.pk).update(
                    canonica=True, sinonimo_de=None
                )
                Competencia.objects.filter(
                    pk__in=[termo.pk for termo in sinonimos]
                ).update(sinonimo_de=canonico, canonica=False)

        self.stdout.write(f'Grupos de sinônimos: {len(ligacoes)}.')
