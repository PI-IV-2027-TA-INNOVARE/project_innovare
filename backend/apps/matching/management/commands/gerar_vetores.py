"""
Gera os vetores da afinidade com o tema para a rede inteira, de uma vez.

    python manage.py gerar_vetores

Calcula o vetor de cada perfil ativo da rede e de cada competencia necessaria
que ainda nao tem vetor, ou cujo texto mudou. O que ja esta em dia fica como
esta. Sem isto os vetores sao calculados na primeira rodada de matching, que
fica mais lenta.

Grava dados: por padrao roda so contra banco local (AGENTS.md 0.1). Em banco
remoto, so a pedido explicito, depois do backup, com `--banco-remoto`.
"""
from django.core.management.base import BaseCommand

from apps.competencies.models import CompetenciaNecessaria
from apps.matching.services.matching import candidatos_da_rede
from apps.matching.services.motor import candidato_de
from apps.matching.services.semantica import BaseSemantica, provedor_de_embedding
from core.management.commands.semear_dev import exigir_banco_local


class Command(BaseCommand):
    help = 'Gera os vetores da afinidade com o tema para a rede e as competências.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--banco-remoto',
            action='store_true',
            help='Permite gravar num banco que não é local. Só depois do backup.',
        )

    def handle(self, *args, **options):
        if not options['banco_remoto']:
            exigir_banco_local()

        provedor = provedor_de_embedding()

        if not getattr(provedor, 'disponivel', False):
            self.stdout.write(
                'Base semântica desligada (SEARCH_EMBEDDING_ENABLED) ou modelo '
                'indisponível: nenhum vetor foi gerado.'
            )
            return

        candidatos = [candidato_de(membro) for membro in candidatos_da_rede()]
        competencias = list(CompetenciaNecessaria.objects.all())

        base = BaseSemantica(provedor)
        resultado = base.preparar(competencias, candidatos)

        if not base.disponivel:
            self.stdout.write('O modelo de embedding falhou: nenhum vetor foi gravado.')
            return

        self.stdout.write(
            f'Vetores calculados: {resultado["calculados"]}. '
            f'Já em dia: {resultado["reaproveitados"]}. Modelo: {base.modelo}.'
        )
