"""
Semeia o banco LOCAL com uma conta de cada ator, para navegar pelo sistema.

    python manage.py semear_dev
    python manage.py semear_dev --senha OutraSenha

Idempotente: rodar de novo atualiza o que existe em vez de duplicar.

AGENTS.md 0.1: script de seed roda **apenas** contra ambiente local, com dados
ficticios. A trava abaixo recusa qualquer host remoto - nao ha flag que a
desligue.
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Papel, SituacaoConta, Usuario
from apps.network.models import (
    Disponibilidade,
    MembroRede,
    PapelNaRede,
    SituacaoMembro,
    Titulacao,
)
from apps.organizations.models import Organizacao, TipoOrganizacao

TITULACOES = [
    ('graduacao', 'Graduacao', 1),
    ('especializacao', 'Especializacao', 2),
    ('mestrado', 'Mestrado', 3),
    ('doutorado', 'Doutorado', 4),
    ('pos_doutorado', 'Pos-doutorado', 5),
]

CONTAS = [
    ('admin@ac2.com.br', 'Administracao da plataforma', Papel.ADMINISTRADOR, 'ac2'),
    ('supervisor@ac2.com.br', 'Rafael Antunes', Papel.SUPERVISOR, 'ac2'),
    ('pesquisador@ac2.com.br', 'Maria Ferreira', Papel.PESQUISADOR, 'ac2'),
    ('demandante@ac2.com.br', 'Agroindustria Vale Verde', Papel.DEMANDANTE, 'demandante'),
]


class Command(BaseCommand):
    help = 'Cria uma conta de cada ator no banco local, para desenvolvimento.'

    def add_arguments(self, parser):
        parser.add_argument('--senha', default='123', help='senha das contas (padrao: 123)')

    @transaction.atomic
    def handle(self, *args, **opcoes):
        self._exigir_banco_local()

        senha = opcoes['senha']

        ac2 = self._organizacao(
            nome='AC2 Microbiologia',
            tipo=TipoOrganizacao.INSTITUICAO,
            cnpj=None,
        )
        demandante = self._organizacao(
            nome='Agroindustria Vale Verde',
            tipo=TipoOrganizacao.DEMANDANTE,
            cnpj='11222333000181',
        )
        organizacoes = {'ac2': ac2, 'demandante': demandante}

        for codigo, rotulo, nivel in TITULACOES:
            Titulacao.objects.update_or_create(
                codigo=codigo, defaults={'rotulo': rotulo, 'nivel': nivel}
            )

        self.stdout.write(self.style.SUCCESS('\nContas (senha: %s)\n' % senha))
        self.stdout.write(f'  {"E-MAIL":28} {"PAPEL":16} NOME')

        criadas = []

        for email, nome, papel, chave_org in CONTAS:
            usuario, novo = Usuario.objects.get_or_create(
                email=email,
                defaults={'nome': nome, 'papel': papel},
            )
            usuario.nome = nome
            usuario.papel = papel
            usuario.organizacao = organizacoes[chave_org]
            usuario.situacao = SituacaoConta.ATIVO
            usuario.is_staff = usuario.is_superuser = papel == Papel.ADMINISTRADOR
            usuario.set_password(senha)
            usuario.save()

            criadas.append((usuario, novo))
            self.stdout.write(f'  {email:28} {papel:16} {nome}')

        doutorado = Titulacao.objects.get(codigo='doutorado')

        for usuario, _ in criadas:
            if usuario.papel not in (Papel.PESQUISADOR, Papel.SUPERVISOR):
                continue

            MembroRede.objects.update_or_create(
                email=usuario.email,
                defaults={
                    'usuario': usuario,
                    'nome': usuario.nome,
                    'papel_rede': (
                        PapelNaRede.SUPERVISOR
                        if usuario.papel == Papel.SUPERVISOR
                        else PapelNaRede.PESQUISADOR
                    ),
                    'titulacao': doutorado,
                    'organizacao': ac2,
                    'disponibilidade': Disponibilidade.PARCIAL,
                    'situacao': SituacaoMembro.ATIVO,
                    'experiencia': 'Dado ficticio de desenvolvimento.',
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'\n{Usuario.objects.count()} conta(s) no banco, '
                f'{MembroRede.objects.count()} membro(s) na rede.\n'
            )
        )

    def _organizacao(self, *, nome, tipo, cnpj):
        organizacao, _ = Organizacao.objects.update_or_create(
            nome=nome, defaults={'tipo': tipo, 'cnpj': cnpj, 'ativo': True}
        )
        return organizacao

    def _exigir_banco_local(self):
        host = settings.DATABASES['default'].get('HOST', '')

        if host.strip().lower() not in settings.LOCAL_DB_HOSTS:
            raise CommandError(
                f'DB_HOST aponta para {host}, que nao e local. Seed so roda '
                'contra banco local (AGENTS.md 0.1). Ajuste o backend/.env.'
            )
