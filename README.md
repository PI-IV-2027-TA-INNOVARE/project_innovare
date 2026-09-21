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

## Estrutura

```
project_innovare/
├── dev.py                  # sobe backend + frontend juntos
├── backend/                # API Django (ver backend/README.md)
├── frontend/               # SPA React + Vite
├── IA/                     # experimentos de IA
└── .github/workflows/
```

