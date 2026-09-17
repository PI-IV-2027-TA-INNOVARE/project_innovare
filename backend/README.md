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
| Linguagem | Python 3.10+ |
| Framework | Django 5.2 · Django REST Framework 3.17 |
| Auth | SimpleJWT (`/api/auth/token/`) |
| Banco | PostgreSQL 14+ (pgvector chega com o matching, Fase 3.3) |
| Docs | drf-spectacular · Swagger em `/api/docs/` |

Nenhuma dependência nova em relação ao backend legado — `requirements.txt` é um
subconjunto do que já estava em uso. Acrescentar uma linha ali é portão de
decisão (`AGENTS.md` §3.2).

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
| `POST /api/auth/token/` | Login; devolve `access`, `refresh` e `papel` | público |
| `POST /api/auth/token/refresh/` | Renova o acesso | público |
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

---

## Testes

```bash
python manage.py test              # runner do Django, não pytest
python manage.py test apps.accounts
```

Mandatos que a suíte respeita sem exceção (`AGENTS.md` §0.1): banco local ou
SQLite em memória, e-mail em `locmem`, `GEMINI_API_KEY` vazia e rerank
desligado — forçados no `settings.py`, sem flag que desligue.
