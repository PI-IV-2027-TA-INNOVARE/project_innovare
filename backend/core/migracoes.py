"""
Apoio para migrations que so sabem converter a tabela vazia.

Quatro migrations do realinhamento com o Diagrama de Classes abandonam uma
coluna sem ter de onde tirar o valor novo para as linhas antigas
(`competencies.0002`, `maturity.0003`, `matching.0002`, `copilot.0004`). Todas
assumem a tabela vazia - assumir em docstring nao impede ninguem de rodar com
dado dentro.

Sem guarda, o desfecho e pior do que falhar: o erro chega depois de as
migrations anteriores do mesmo `migrate` ja terem commitado, e o banco fica
entre dois estados, repetindo a falha a cada tentativa. Pior ainda quando a
operacao e um `DeleteModel`, que nao falha - leva as linhas embora em silencio.
A guarda para antes da primeira escrita e diz o que fazer.
"""
from __future__ import annotations

from typing import Any, Callable

from django.apps.registry import Apps
from django.db.backends.base.schema import BaseDatabaseSchemaEditor


class MigrationExigeTabelaVazia(RuntimeError):
    """A migration nao converte as linhas existentes, e existem linhas."""


def exigir_tabela_vazia(
    app_label: str,
    modelo: str,
    motivo: str,
    filtro: dict[str, Any] | None = None,
) -> Callable[[Apps, BaseDatabaseSchemaEditor], None]:
    """
    Devolve a operacao de guarda para o topo de `Migration.operations`.

    `motivo` completa a frase "esta migration nao ... ": entra na mensagem de
    erro para que quem a receba entenda por que nao ha conversao automatica.
    `filtro` restringe a exigencia a um recorte da tabela - use quando so
    algumas linhas atrapalham, nao a tabela inteira.
    """

    def guarda(apps: Apps, schema_editor: BaseDatabaseSchemaEditor) -> None:
        Modelo = apps.get_model(app_label, modelo)
        total = Modelo.objects.filter(**filtro).count() if filtro else (
            Modelo.objects.count()
        )

        if not total:
            return

        recorte = f' em {filtro}' if filtro else ''

        raise MigrationExigeTabelaVazia(
            f'{app_label}.{modelo} tem {total} registro(s){recorte} e esta '
            f'migration nao {motivo}.\n'
            f'Nada foi alterado. Escolha um caminho antes de repetir o '
            f'migrate:\n'
            f'  1. ambiente de desenvolvimento - descarte essas linhas e rode '
            f'de novo;\n'
            f'  2. ambiente com dado que importa - escreva a migration de '
            f'dados que faz a conversao e ponha-a antes desta.\n'
            f'Apagar por conta propria nao e opcao desta guarda: a escolha e '
            f'de quem responde pelo dado.'
        )

    return guarda
