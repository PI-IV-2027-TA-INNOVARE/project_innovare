#!/usr/bin/env python
"""Utilitario de linha de comando do Django para o P&D Connect."""
import os
import sys


def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            'Nao foi possivel importar o Django. Ele esta instalado e o '
            'virtualenv esta ativo?'
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
