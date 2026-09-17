"""
Provisiona uma conta no Neon pelo endpoint HTTP (porta 443).

POR QUE ISTO EXISTE
-------------------
Nao ha rota publica de criacao de conta (RN-A04 / D06): a primeira conta tem de
nascer de dentro. O caminho normal e `manage.py createsuperuser`, que precisa da
porta 5432. Onde ela esta bloqueada, este script faz o mesmo trabalho por HTTPS.

A senha e hasheada pelo proprio Django (mesmo `PASSWORD_HASHERS` do settings) -
o que viaja e o hash, nunca a senha em claro.

USO
---
    python scripts/neon_criar_conta.py \\
        --email admin@ac2microbiologia.com.br \\
        --nome "Administracao da plataforma" \\
        --papel administrador

Sem `--senha`, a senha e pedida no terminal (nao fica no historico do shell).
"""
import argparse
import getpass
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.contrib.auth.hashers import make_password  # noqa: E402

from apps.accounts.models import Papel, SituacaoConta  # noqa: E402
from scripts.neon_http import Neon  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email', required=True)
    parser.add_argument('--nome', required=True)
    parser.add_argument('--papel', required=True, choices=Papel.values)
    parser.add_argument('--senha', help='se omitido, e pedida no terminal')
    parser.add_argument(
        '--admin-django',
        action='store_true',
        help='da acesso ao /admin do Django (ferramenta de suporte)',
    )
    args = parser.parse_args()

    if settings.RUNNING_TESTS:
        raise SystemExit('Este script nunca roda durante a suite de testes.')

    senha = args.senha or getpass.getpass('Senha: ')
    if not senha:
        raise SystemExit('Senha vazia.')

    email = args.email.strip().lower()
    neon = Neon()

    if neon.linhas('SELECT 1 FROM usuario WHERE email = $1', [email]):
        raise SystemExit(f'Ja existe uma conta com {email}.')

    neon.executar(
        """
        INSERT INTO usuario
            (nome, email, senha, papel, situacao, acesso_admin_django,
             is_superuser, criado_em, atualizado_em)
        VALUES ($1, $2, $3, $4, $5, $6, $6, now(), now())
        """,
        [
            args.nome,
            email,
            make_password(senha),
            args.papel,
            SituacaoConta.ATIVO,
            args.admin_django,
        ],
    )

    print(f'Conta criada no Neon: {email} ({args.papel}).')


if __name__ == '__main__':
    main()
