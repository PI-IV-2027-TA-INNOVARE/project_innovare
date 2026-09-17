# P&D Connect — AC2 Microbiologia

Plataforma que conduz uma **Oportunidade de P&D** da entrada até a decisão do
Supervisor: cadastro, estruturação assistida por IA, competências necessárias,
matching sobre a rede interna, pré-análise de maturidade PIPE/FAPESP e o
registro da decisão humana.

MVP acadêmico — Projeto Integrador IV, Innovare. Prazo: dezembro de 2026.

| Documento | Para quê |
|---|---|
| [`CONTEXT.md`](CONTEXT.md) | Domínio, atores, escopo e linguagem ubíqua |
| [`AGENTS.md`](AGENTS.md) | Mandatos de engenharia e portões de decisão |
| [`PLANO_IMPLEMENTACAO.md`](PLANO_IMPLEMENTACAO.md) | Plano técnico e sequenciamento |
| [`backend/README.md`](backend/README.md) | API: stack, rotas, banco, testes |

---

## Subir tudo

Uma vez, para preparar o ambiente:

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate           # Windows;  source venv/bin/activate no Linux
pip install -r requirements.txt
cp .env.example .env             # e preencha
python manage.py migrate
cd ..

# Frontend
cd frontend
npm install
cp .env.example .env
cd ..
```

### Contas de desenvolvimento

Não há autocadastro (RN-A04), então o banco começa vazio. Um comando cria uma
conta de cada ator:

```bash
cd backend
python manage.py semear_dev            # senha padrão: 123
python manage.py semear_dev --senha OutraSenha
```

| E-mail | Papel | O que enxerga |
|---|---|---|
| `admin@ac2.com.br` | Administrador | Contas, permissões, configuração. **Não** entra no fluxo científico |
| `supervisor@ac2.com.br` | Supervisor | A fila de oportunidades, a rede, e é quem registra a decisão |
| `pesquisador@ac2.com.br` | Pesquisador | O próprio perfil e as oportunidades da sua equipe |
| `demandante@ac2.com.br` | Demandante Externo | Apenas os próprios problemas |

É idempotente — rodar de novo atualiza em vez de duplicar. O Supervisor e o
Pesquisador ganham também um registro em `membro_rede`, que é de onde o perfil
profissional e o matching vão ler.

O comando **recusa rodar contra banco remoto** (`AGENTS.md` §0.1), sem flag que
desligue: dados fictícios não entram no Neon.

Depois, no dia a dia, **um comando na raiz sobe os dois**:

```bash
python dev.py
```

| | |
|---|---|
| API | http://127.0.0.1:8000/api/ |
| Swagger | http://127.0.0.1:8000/api/docs/ |
| Front | http://localhost:5173/ |

Cada linha de saída vem marcada com `[backend]` ou `[frontend]`, para que um
traceback do Django e um erro do Vite não se confundam no scroll. `Ctrl+C`
derruba os dois.

```bash
python dev.py --checar        # só o diagnóstico do ambiente, não sobe nada
python dev.py --so-backend    # só a API
python dev.py --so-frontend   # só o front
python dev.py --porta-backend 8001
```

> **Quando preferir dois terminais.** O `dev.py` é conveniência, não obrigação.
> Depurando um dos lados a sério, dois terminais são melhores: você reinicia um
> sem derrubar o outro. `cd backend && python manage.py runserver` e
> `cd frontend && npm run dev`.

### Duas coisas que costumam morder no Windows

- **O front responde em `localhost:5173`, não em `127.0.0.1:5173`.** O Vite se
  liga ao loopback IPv6 (`[::1]`). O navegador resolve certo; um `curl` ou script
  que chuta o endereço IPv4 conclui, errado, que o front não subiu.
- **Se `python dev.py` reclamar de porta ocupada**, sobrou um processo de uma
  execução anterior. `netstat -ano | findstr :5173` mostra o PID;
  `taskkill /F /T /PID <pid>` resolve.

---

## Testes

```bash
cd backend  && python manage.py test     # runner do Django, não pytest
cd frontend && npm test                  # Vitest + Testing Library
```

Mandatos que a suíte respeita sem exceção (`AGENTS.md` §0.1): banco local ou
SQLite em memória, e-mail em `locmem`, chave de IA vazia — forçados no
`settings.py`, sem flag que desligue.

---

## Estrutura

```
project_innovare/
├── dev.py                  # sobe backend + frontend juntos
├── backend/                # API Django (ver backend/README.md)
├── frontend/               # SPA React + Vite
├── IA/                     # experimentos de IA
└── .github/workflows/
```

O banco de desenvolvimento é PostgreSQL **local**. O Neon é o ambiente
compartilhado, e apontar a API para ele é troca de bloco no `backend/.env` —
ver [`backend/README.md`](backend/README.md), seção *Banco*, inclusive para o
caso de a rede bloquear a porta 5432.
