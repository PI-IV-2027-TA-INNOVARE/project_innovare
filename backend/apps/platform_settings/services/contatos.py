"""
Contatos de suporte: quem procurar quando o acesso e barrado.

A lista vale para todos os usuarios, logo mora no banco. Sem linha gravada
vale o padrao da AC2 - restaurar e apagar o que foi gravado, nao copiar o
padrao para a tabela.
"""
from django.db import transaction

from apps.accounts.models import Usuario
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.platform_settings.models import ContatoSuporte

CONTATOS_PADRAO = (
    {
        'nome': 'Núcleo de P&D — AC2',
        'email': 'pd@ac2microbiologia.com.br',
        'papel': 'Cadastro e liberação de acesso',
    },
    {
        'nome': 'Administração da plataforma',
        'email': 'admin@ac2microbiologia.com.br',
        'papel': 'Contas, perfis e permissões',
    },
)


def contatos_vigentes() -> list[dict]:
    gravados = list(
        ContatoSuporte.objects.filter(ativo=True).values('nome', 'email', 'papel')
    )

    return gravados or [dict(contato) for contato in CONTATOS_PADRAO]


def encarregado_de_dados() -> dict | None:
    """
    O encarregado de dados (LGPD, art. 41), se a AC2 ja o indicou.

    E o contato de suporte cujo "do que cuida" fala em encarregado: o mesmo
    cadastro que o Administrador ja mantem em Parametros.
    """
    for contato in contatos_vigentes():
        if 'encarregad' in (contato.get('papel') or '').lower():
            return {'nome': contato['nome'], 'email': contato['email']}

    return None


def _registrar(tipo: str, ator: Usuario, emails: list[str]) -> None:
    registrar_evento(
        categoria=CategoriaEvento.CONFIG,
        tipo=tipo,
        entidade='configuracao',
        entidade_id='contatos_suporte',
        ator=ator.email,
        detalhe={'emails': emails},
    )


class SubstituirContatosService:
    """Troca a lista inteira de uma vez: a ordem da tela e a ordem gravada."""

    @transaction.atomic
    def execute(self, *, contatos: list[dict], ator: Usuario) -> list[dict]:
        ContatoSuporte.objects.all().delete()
        ContatoSuporte.objects.bulk_create(
            ContatoSuporte(
                nome=contato['nome'],
                email=contato['email'],
                papel=contato.get('papel', ''),
                ordem=ordem,
            )
            for ordem, contato in enumerate(contatos)
        )
        _registrar(
            'contatos_suporte_alterados', ator, [contato['email'] for contato in contatos]
        )

        return contatos_vigentes()


class RestaurarContatosService:
    @transaction.atomic
    def execute(self, *, ator: Usuario) -> list[dict]:
        ContatoSuporte.objects.all().delete()
        _registrar(
            'contatos_suporte_restaurados',
            ator,
            [contato['email'] for contato in CONTATOS_PADRAO],
        )

        return contatos_vigentes()
