#!/usr/bin/env bash
#
# Prepara e sobe o P&D Connect nesta máquina, de um clone novo até a tela aberta.
#
#     bash iniciar.sh                 # prepara o que faltar e sobe backend e front
#     bash iniciar.sh --so-preparar   # só prepara, não sobe nada
#     bash iniciar.sh --so-backend    # as demais opções vão direto para o dev.py
#
# Precisa de Python 3.11+ (o projeto roda em 3.14), Node 20+ (o projeto roda em
# 24) e de um PostgreSQL no ar. No Windows, rode no Git Bash.
#
# Pode rodar quantas vezes quiser. O .env existente nunca é sobrescrito, as
# dependências só são reinstaladas quando requirements.txt ou package-lock.json
# mudam, e a semente só roda em banco sem nenhuma conta, porque o semear_dev
# redefine senhas.
#
# Com DB_HOST remoto no backend/.env, nada é migrado nem semeado (AGENTS.md 0.1).
#
# Sem .env, o script gera um mínimo em vez de copiar o .env.example: lá as chaves
# numéricas estão vazias, e vazias elas derrubam a subida com ValueError.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ"

SO_PREPARAR=0
OPCOES_DO_DEV=()

for opcao in "$@"; do
  case "$opcao" in
    --so-preparar) SO_PREPARAR=1 ;;
    *) OPCOES_DO_DEV+=("$opcao") ;;
  esac
done

etapa() { printf '\n==> %s\n' "$1"; }
aviso() { printf 'aviso: %s\n' "$1" >&2; }
falha() { printf '\nerro: %s\n' "$1" >&2; exit 1; }

achar_python() {
  local candidato
  for candidato in "python3.14" "py -3.14" "python3" "python" "py -3"; do
    if $candidato -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' >/dev/null 2>&1; then
      PYTHON_BASE=($candidato)
      return 0
    fi
  done
  return 1
}

python_do_venv() {
  local caminho
  for caminho in backend/venv/Scripts/python.exe backend/venv/bin/python \
                 backend/.venv/Scripts/python.exe backend/.venv/bin/python; do
    if [ -f "$caminho" ]; then
      printf '%s' "$RAIZ/$caminho"
      return 0
    fi
  done
  return 1
}

no_python() {
  "$VENV_PY" "$@" | tr -d '\r'
}

preparar_venv() {
  etapa "Ambiente Python"

  if VENV_PY="$(python_do_venv)"; then
    echo "Usando o venv que já existe."
  else
    achar_python || falha "Python 3.11+ não encontrado. Instale o Python 3.14 e rode de novo."
    echo "Criando backend/venv com: ${PYTHON_BASE[*]}"
    "${PYTHON_BASE[@]}" -m venv backend/venv
    VENV_PY="$(python_do_venv)" || falha "O venv foi criado, mas o Python dele não apareceu em backend/venv."
  fi

  "$VENV_PY" -c 'import sys' >/dev/null 2>&1 \
    || falha "O Python do venv não roda ($VENV_PY). Apague a pasta do venv e rode de novo."

  local versao
  versao="$(no_python -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
  echo "Python $versao."
  [ "$versao" = "3.14" ] || aviso "o projeto e o CI rodam em Python 3.14; este venv está em $versao."
}

instalar_torch() {
  "$VENV_PY" -m pip show torch >/dev/null 2>&1 && return 0

  local versao
  versao="$(sed -n 's/^ARG TORCH_VERSION=//p' backend/Dockerfile | tr -d '\r')"
  [ -n "$versao" ] || falha "Não achei a versão do torch em backend/Dockerfile."

  echo "Instalando o torch $versao. Na primeira vez demora: são centenas de MB."
  if [ "$(uname -s)" = "Linux" ]; then
    "$VENV_PY" -m pip install --disable-pip-version-check \
      --index-url https://download.pytorch.org/whl/cpu "torch==$versao"
  else
    "$VENV_PY" -m pip install --disable-pip-version-check "torch==$versao"
  fi
}

instalar_dependencias_do_backend() {
  etapa "Dependências do backend"

  local carimbo atual
  carimbo="$(dirname "$(dirname "$VENV_PY")")/.pdconnect-requirements"
  atual="$(cksum < backend/requirements.txt)"

  if [ -f "$carimbo" ] && [ "$(cat "$carimbo")" = "$atual" ]; then
    echo "Nada mudou em requirements.txt."
    return 0
  fi

  instalar_torch
  "$VENV_PY" -m pip install --disable-pip-version-check -r backend/requirements.txt
  printf '%s\n' "$atual" > "$carimbo"
}

criar_env_do_backend() {
  etapa "Configuração do backend"

  if [ -f backend/.env ]; then
    echo "backend/.env já existe: mantido como está."
    return 0
  fi

  local nome="${DB_NAME:-pdconnect}"
  local usuario="${DB_USER:-postgres}"
  local senha="${DB_PASSWORD:-}"
  local host="${DB_HOST:-127.0.0.1}"
  local porta="${DB_PORT:-5432}"
  local resposta

  if [ -t 0 ]; then
    echo "Criando backend/.env. Enter aceita o valor entre colchetes."
    read -r -p "Nome do banco [$nome]: " resposta
    nome="${resposta:-$nome}"
    read -r -p "Usuário do PostgreSQL [$usuario]: " resposta
    usuario="${resposta:-$usuario}"
    read -r -s -p "Senha do PostgreSQL: " resposta
    echo
    senha="${resposta:-$senha}"
  fi

  local chave
  chave="$(no_python -c 'import secrets; print(secrets.token_urlsafe(50))')"

  (
    umask 077
    cat > backend/.env <<EOF
# Gerado por iniciar.sh para desenvolvimento local. Nunca entra no git.
# As demais opções, com a explicação de cada uma, estão em .env.example.
AMBIENTE=local
SECRET_KEY=$chave
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

DB_NAME=$nome
DB_USER=$usuario
DB_PASSWORD=$senha
DB_HOST=$host
DB_PORT=$porta

EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
SEND_NOTIFICATION_EMAILS=False
FRONTEND_URL=http://localhost:5173

GEMINI_API_KEY=
AI_MATCH_RERANK_ENABLED=False
EOF
  )

  echo "backend/.env criado."
}

preparar_front() {
  etapa "Dependências do front"

  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 \
    || falha "Node.js não encontrado. Instale o Node 24 e rode de novo."

  local versao
  versao="$(node -p 'process.versions.node.split(".")[0]' | tr -d '\r')"
  [ "$versao" -ge 20 ] || falha "O front precisa do Node 20 ou mais novo; achei o $versao."
  [ "$versao" = "24" ] || aviso "o projeto e o CI rodam em Node 24; achei o $versao."

  local carimbo="frontend/node_modules/.pdconnect-lock"

  if [ -f "$carimbo" ] && [ "$(cat "$carimbo")" = "$(cksum < frontend/package-lock.json)" ]; then
    echo "Nada mudou em package-lock.json."
  else
    if [ -d frontend/node_modules ]; then
      ( cd frontend && npm install --no-audit --no-fund )
    else
      ( cd frontend && npm ci --no-audit --no-fund )
    fi
    cksum < frontend/package-lock.json > "$carimbo"
  fi

  if [ ! -f frontend/.env ]; then
    cp frontend/.env.example frontend/.env
    echo "frontend/.env criado."
  fi
}

consultar_banco() {
  (
    cd backend
    PYTHONUTF8=1 "$VENV_PY" - "$1" <<'PY'
import os
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django

django.setup()

from django.conf import settings

import psycopg
from psycopg import sql

acao = sys.argv[1]
banco = settings.DATABASES['default']

if acao == 'onde':
    print('remoto' if settings.DB_HOST_IS_REMOTE else 'local', f"{banco['HOST']}:{banco['PORT']}")
    sys.exit(0)

if acao == 'tem_contas':
    from apps.accounts.models import Usuario

    sys.exit(0 if Usuario.objects.exists() else 1)

if acao == 'garantir':
    conexao = {
        'host': banco['HOST'],
        'port': banco['PORT'],
        'user': banco['USER'],
        'password': banco['PASSWORD'],
        'connect_timeout': 5,
    }

    try:
        psycopg.connect(dbname=banco['NAME'], **conexao).close()
    except psycopg.OperationalError:
        try:
            with psycopg.connect(dbname='postgres', autocommit=True, **conexao) as manutencao:
                existe = manutencao.execute(
                    'SELECT 1 FROM pg_database WHERE datname = %s', [banco['NAME']]
                ).fetchone()

                if existe:
                    raise SystemExit(f"O banco {banco['NAME']} existe, mas recusou a conexão.")

                manutencao.execute(
                    sql.SQL('CREATE DATABASE {}').format(sql.Identifier(banco['NAME']))
                )
                print(f"Banco {banco['NAME']} criado.")
        except psycopg.Error as erro:
            raise SystemExit(str(erro).strip())
    else:
        print(f"Banco {banco['NAME']} encontrado.")
PY
  )
}

preparar_banco() {
  etapa "Banco de dados"

  local saida onde endereco
  saida="$(consultar_banco onde | tr -d '\r' | tail -n 1)" \
    || falha "O Django não carregou. Veja o erro acima e confira o backend/.env."
  read -r onde endereco <<< "$saida"

  if [ "$onde" = "remoto" ]; then
    aviso "DB_HOST não é local: o script não migra nem semeia esse banco (AGENTS.md 0.1)."
    return 0
  fi

  if ! consultar_banco garantir; then
    falha "Não consegui usar o PostgreSQL em $endereco.
Confira se ele está no ar e os valores DB_* em backend/.env.
Sem PostgreSQL instalado, dá para subir um com Docker:
  docker run --name pdconnect-db -e POSTGRES_PASSWORD=<a senha do .env> -p 5432:5432 -d postgres:16"
  fi

  ( cd backend && "$VENV_PY" manage.py migrate --noinput )

  if consultar_banco tem_contas; then
    echo "O banco já tem contas: semente não executada."
  else
    ( cd backend && "$VENV_PY" manage.py semear_dev )
  fi
}

preparar_venv
instalar_dependencias_do_backend
criar_env_do_backend
preparar_front
preparar_banco

if [ "$SO_PREPARAR" = "1" ]; then
  etapa "Pronto"
  echo "Para subir: bash iniciar.sh"
  exit 0
fi

etapa "Subindo o P&D Connect"
exec "$VENV_PY" dev.py ${OPCOES_DO_DEV[@]+"${OPCOES_DO_DEV[@]}"}
