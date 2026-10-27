# P&D Connect — backend

API REST do P&D Connect. Conduz a Oportunidade da entrada à decisão do
Supervisor.

- **Mandatos de engenharia:** [`../AGENTS.md`](../AGENTS.md) — leia antes de escrever código.
- **Domínio, atores e linguagem ubíqua:** [`../CONTEXT.md`](../CONTEXT.md).
- **Sequenciamento:** [`../PLANO_IMPLEMENTACAO.md`](../PLANO_IMPLEMENTACAO.md).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Linguagem | Python 3.12 |
| Framework | Django 5.2 · Django REST Framework 3.17 |
| Auth | SimpleJWT (`/api/auth/token/`) |
| Banco | PostgreSQL 14+ (sem extensão: o embedding do matching fica em coluna `jsonb` — plano §8.3) |
| Docs | drf-spectacular · Swagger em `/api/docs/` |

O driver do Postgres é o **psycopg 3** (`psycopg[binary,pool]`), que traz o pool
de conexões nativo do Django 5.2 — ver [Pool de conexões](#pool-de-conexões).
Acrescentar uma linha no `requirements.txt` é portão de decisão (`AGENTS.md`
§3.2).

**Já tinha o projeto rodando?** Com o venv ativo, rode uma vez
`pip install -r requirements.txt`: só os pacotes que mudaram são baixados. O
`psycopg2-binary` antigo pode ficar instalado — o Django prefere o psycopg 3
quando os dois existem —, ou saia com `pip uninstall psycopg2-binary`.

---

## Subir localmente

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows;  source venv/bin/activate no Linux
pip install -r requirements.txt

cp .env.example .env            # e preencha
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

O front (Vite, porta 5173) já aponta para `http://127.0.0.1:8000/api` — ver
`frontend/.env`.

---

## Banco

### Desenvolvimento e teste: PostgreSQL local

`manage.py test` **cria e destrói** um banco `test_<DB_NAME>`. Apontado para um
host remoto, isso criaria e dropparia um banco de verdade na conta do cliente.
Mandato `AGENTS.md` §0.1: mantenha `DB_HOST` local.

O `settings.py` tem uma trava que troca para SQLite em memória se detectar
execução de teste com `DB_HOST` remoto — mas ela é a última linha de defesa, não
a primeira.

Para manter o `.env` do Neon intacto e desenvolver contra o banco local, use um
segundo arquivo — `.env.*` também fica fora do git — e aponte para ele:

```bash
cp .env .env.local              # troque o bloco DB_* para o Postgres local,
                                # AMBIENTE=local e DB_SSLMODE=prefer
PDCONNECT_ENV_FILE=.env.local python manage.py runserver
```

No PowerShell: `$env:PDCONNECT_ENV_FILE='.env.local'; python manage.py runserver`.

### Pool de conexões

Ligado por padrão (`DB_POOL`). O `runserver` abre uma thread por requisição, e a
conexão do Django é por thread: sem pool, **toda** requisição reabre a conexão
— contra o Neon, que fica nos EUA, mais de um segundo de TCP, TLS e autenticação
antes da primeira query. Com o pool, a conexão é aberta uma vez por processo e
emprestada às threads. A suíte nunca usa pool.

### Neon (ambiente compartilhado)

As credenciais estão em `NEON_DB_*` no `.env`. Para apontar a API ao Neon,
substitua o bloco `DB_*` pelos valores comentados no próprio arquivo.

**Se `manage.py migrate` der `timeout expired` contra o Neon**, a rede está
bloqueando a porta 5432 de saída — foi o caso na máquina onde este backend
nasceu. Diagnóstico rápido:

```bash
python -c "import socket;s=socket.socket();s.settimeout(8);s.connect(('<host>.neon.tech',5432))"
```

O Neon também responde SQL sobre HTTPS na porta 443, que costuma passar. Para
esse caso existe:

```bash
python scripts/neon_migrate.py --plano      # o que falta aplicar
python scripts/neon_migrate.py --aplicar    # aplica
```

O script **não** é um canal alternativo de schema: o SQL que ele envia é gerado
pelo Django a partir das migrations (`sqlmigrate`), nunca escrito à mão, e ele
grava a linha correspondente em `django_migrations`. A migration continua sendo
o canal único (`AGENTS.md` §2.2). Assim que a 5432 estiver acessível, use
`manage.py migrate` e esqueça o script.

> **Pendência conhecida:** o script aplica DDL, mas não dispara o sinal
> `post_migrate` — então `django_content_type` e `auth_permission` ficam vazios
> no Neon. Isso não afeta a API (permissão = papel, ver `apps/accounts/permissoes.py`),
> só o Django admin. Um `manage.py migrate` de uma rede sem bloqueio popula as
> duas tabelas sem reaplicar schema nenhum.

### Backup antes de mexer no Neon

O Neon é homologação: desenvolvimento é no Postgres local, e `AMBIENTE=producao`
com `DEBUG=True` impede a API de subir. Antes de qualquer escrita no Neon,
backup e ensaio da migration num restore local desse backup. A cópia nunca fica
em texto aberto:

```bash
python scripts/backup_cifrado.py copiar ../backups/neon/neondb_AAAA-MM-DD.dump -- pg_dump -Fc -h ... -U ... -d ...
python scripts/backup_cifrado.py restaurar <arquivo>.cifrado -- pg_restore -h localhost -U ... -d ensaio
python scripts/backup_cifrado.py descartar <arquivo>.cifrado --motivo "ensaio concluído"
```

`copiar` cifra a saída do `pg_dump` na memória e `restaurar` entrega o
conteúdo decifrado ao `pg_restore` pela entrada padrão: nenhuma cópia aberta
passa pelo disco. Dump que já existe em claro: `cifrar <arquivo>.dump`. A pasta
de backups fica num disco cifrado, porque apagar arquivo em SSD não garante que
o conteúdo some.

A senha vem de `PDCONNECT_BACKUP_SENHA` ou é pedida no terminal, e nunca vai
para arquivo. O backup é guardado só até o ensaio dar certo; cada ação fica em
`REGISTRO_DE_BACKUPS.md`, na pasta do backup.

---

## Estrutura

```
backend/
├── config/            settings, urls, wsgi/asgi
├── core/              bases transversais: modelos, exceções, permissões, paginação
├── apps/
│   ├── accounts/         usuario, token_acesso           — acesso e contas
│   ├── organizations/    organizacao                     — demandante e instituição
│   ├── network/          membro_rede, titulacao, competencia, membro_competencia, formacao
│   ├── platform_settings/ configuracao_plataforma, contato_suporte
│   ├── opportunities/    oportunidade, anexo_oportunidade, sequencia_codigo
│   ├── ai/               execucao_ia                     — rastreabilidade e custo
│   ├── copilot/          proposta_estruturada, sessao_copiloto, mensagem_copiloto, lacuna
│   ├── competencies/     competencia_necessaria
│   ├── matching/         execucao_matching, equipe_potencial
│   ├── maturity/         criterio_pre_analise, pre_analise, pre_analise_dimensao, recomendacao
│   ├── decisions/        decisao
│   ├── audit/            evento_auditoria                — append-only, RF12
│   └── notifications/    notificacao                     — P17 em aberto
└── scripts/           ferramentas de operação (não são código de produção)
```

Camadas dentro de cada app: `models` → `serializers` → `views` → `services`.
**Regra de negócio não mora na view nem no serializer.**

---

## O que já está implementado

**Fase 2 — acesso (`apps/accounts`)**

| Rota | Faz | Quem |
|---|---|---|
| `POST /api/auth/token/` | Login; devolve `access` e `papel` no corpo e o `refresh` num cookie `HttpOnly` | público |
| `POST /api/auth/token/refresh/` | Renova o acesso pelo cookie (ou pelo corpo, para cliente de API) | público |
| `GET /api/auth/profile/` | Usuário autenticado + `papel` + permissões efetivas | autenticado |
| `POST /api/auth/forgot-password/` | Emite token e envia o e-mail | público |
| `POST /api/auth/reset-password/` | Define a senha (recuperação **e** primeiro acesso) | público |
| `POST /api/auth/change-password/` | Troca de senha com sessão ativa | autenticado |
| `GET /api/permissoes/catalogo/` | Catálogo de permissões por papel | autenticado |

As tabelas das demais fases já existem no banco; as rotas entram com cada fase.

### Decisões de acesso que valem a pena saber

- **Suspender vale na hora.** `AutenticacaoJWTComSituacao` confere `situacao` a
  cada requisição. Sem isso, o access token de uma conta suspensa continuaria
  valendo até expirar — e a tela de admin oferece "suspender" como ação imediata.
- **`is_active` é derivado de `situacao`**, não uma segunda coluna. Duas colunas
  para "esta conta entra?" divergem no primeiro mês.
- **`forgot-password` responde igual exista ou não a conta.** Responder "e-mail
  não cadastrado" transformaria o formulário público num verificador de contas.
- **Não existe rota de autocadastro** (RN-A04 / D06). A conta nasce sem senha
  utilizável e a pessoa a define pelo token de convite.

### Retenção de dados (LGPD)

Eventos de conta (`login`, `login_recusado`, `logout`) são anonimizados depois
de 12 meses; anexos de oportunidade arquivada são descartados 24 meses após o
arquivamento. Os prazos vêm de `RETENCAO_EVENTOS_CONTA_MESES` e
`RETENCAO_ANEXOS_MESES`.

```bash
python manage.py aplicar_retencao             # simulação (padrão)
python manage.py aplicar_retencao --aplicar   # executa e grava `retencao_aplicada`
```

A task `audit.aplicar_retencao` está no `CELERY_BEAT_SCHEDULE` diário às 3h.
Sem broker configurado, o comando continua sendo o caminho de execução.

---

## Testes

```bash
python manage.py test              # runner do Django, não pytest
python manage.py test apps.accounts
```

Mandatos que a suíte respeita sem exceção (`AGENTS.md` §0.1): banco local ou
SQLite em memória, e-mail em `locmem`, `GEMINI_API_KEY` vazia e rerank
desligado — forçados no `settings.py`, sem flag que desligue.
