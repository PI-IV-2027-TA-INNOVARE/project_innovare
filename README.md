# P&D Connect — AC2 Microbiologia

Plataforma que conduz uma **Oportunidade de P&D** da entrada até a decisão do
Supervisor: cadastro, estruturação assistida por IA, competências necessárias,
matching sobre a rede interna, pré-análise de maturidade PIPE/FAPESP e o
registro da decisão humana.

MVP acadêmico — Projeto Integrador IV, Innovare. Prazo: dezembro de 2026.

| Documento | Para quê |
|---|---|
| [`backend/README.md`](backend/README.md) | API: stack, rotas, banco, testes |

---

## Subir com Docker

Só precisa do Docker (no Windows e no Mac, o Docker Desktop aberto). Python,
Node e as dependências ficam dentro dos containers.

```bash
cp backend/.env.example backend/.env    # e preencha; o banco usado é o deste arquivo
docker compose up --build               # a primeira vez demora: baixa o torch e o modelo de IA
```

| | |
|---|---|
| Front | http://localhost:5173/ |
| API | http://127.0.0.1:8000/api/ |
| Swagger | http://127.0.0.1:8000/api/docs/ |

- O código fica montado nos containers: salvar um arquivo recarrega a API e o front.
- O `backend/.env` é lido direto pela API, como fora do Docker. O `frontend/.env`
  não é usado: o compose já aponta o front para a API.
- O compose não sobe banco nem aplica migration. Num banco novo:
  `docker compose run --rm backend python manage.py migrate`.
- Dentro do container, `localhost` é o próprio container. Para um Postgres
  desta máquina, use `DB_HOST=host.docker.internal`.
- O compose também sobe Redis, `worker` e `beat`; a retenção LGPD roda todos os
  dias às 3h pelo beat (ver "Retenção de dados").
- Mudou o `requirements.txt` ou o `package.json`: `docker compose up --build -V`.
- As portas 8000 e 5173 precisam estar livres: pare o `runserver` e o Vite
  antes.
- Testes do front no container: `docker compose run --rm frontend npm test -- --testTimeout=30000`.
  Com o código montado do Windows os testes ficam mais lentos, e o limite padrão
  de 5 s por teste não basta.

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
| Administrador | Contas, permissões, configuração. **Não** entra no fluxo científico |
| Supervisor | A fila de oportunidades, a rede, e é quem registra a decisão |
| Pesquisador | O próprio perfil e as oportunidades da sua equipe |
| Demandante Externo | Apenas os próprios problemas |


```bash
python dev.py
```

| | |
|---|---|
| API | http://127.0.0.1:8000/api/ |
| Swagger | http://127.0.0.1:8000/api/docs/ |
| Front | http://localhost:5173/ |


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

---

## Retenção de dados (LGPD)

Eventos de conta (`login`, entrada recusada e saída) perdem o vínculo com a
pessoa depois de **12 meses**: a trilha mantém o fato, mas anonimiza o ator.
Anexos de oportunidade arquivada são descartados **24 meses** após a decisão de
arquivamento.

```bash
cd backend
python manage.py aplicar_retencao             # simula; não altera nada
python manage.py aplicar_retencao --aplicar   # executa e registra na trilha
```

Os prazos ficam em `RETENCAO_EVENTOS_CONTA_MESES` e `RETENCAO_ANEXOS_MESES`
(`backend/.env`; padrões 12 e 24). Com Celery e Redis configurados, a task
`audit.aplicar_retencao` roda todos os dias às 3h.

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

