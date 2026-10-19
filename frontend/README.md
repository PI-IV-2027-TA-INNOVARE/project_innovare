# P&D Connect — Front-end

Interface web do **P&D Connect**, plataforma do Núcleo de P&D da **AC2
Microbiologia** para estruturar oportunidades de Pesquisa e Desenvolvimento com
apoio de IA.

React 19 · Vite 6 · React Router 7 · SCSS · Vitest · identidade visual AC2.

> **Este diretório contém o front-end.** O back-end (Django + DRF) está em
> [`../backend`](../backend) e precisa estar no ar: o front consome apenas a API
> REST e não tem fonte de dados própria.

> Domínio e regras: [`../CONTEXT.md`](../CONTEXT.md) · Mandatos de engenharia:
> [`../AGENTS.md`](../AGENTS.md)

---

## Como rodar

Não precisa de Django, PostgreSQL nem Redis.

```bash
cd frontend
npm install
npm run dev
```

Abra **http://localhost:5173** — você cai direto na tela de login.

### Credenciais

Não existe conta embutida no front, nem modo de demonstração: toda autenticação
vai para a API (`POST /api/auth/token/`) e todo dado de usuário vem do banco.
Para entrar localmente, suba o backend e use uma conta criada por lá — o
`backend/populate_db.py` semeia dados fictícios para desenvolvimento.

Nenhuma senha mora em arquivo versionado, e `src/test/semCredenciaisNoFonte.test.js`
falha se alguma voltar.

### O que já dá para ver

1. **Login** (`/login`) — split-screen, tema claro/escuro, recuperação de senha.
2. **Painel** (`/painel`) — home por perfil, com o fluxo de valor do produto.
3. **Administração** (`/admin`) — **só com a conta de Administrador**:
   - **Aparência** — troque qualquer cor e veja a aplicação repintar na hora.
   - **Usuários** — tabela com busca e filtro (dados de exemplo, ainda sem API).

Entrando como Supervisor, Pesquisador ou Demandante, `/admin` é bloqueada e
redireciona para `/painel`.

---

## Scripts

```bash
npm run dev            # servidor de desenvolvimento (porta 5173)
npm run build          # build de produção em dist/
npm run preview        # serve o build de produção
npm test               # suíte de testes (Vitest + Testing Library)
npm run test:watch     # suíte em modo observação
npm run test:coverage  # relatório de cobertura (v8)
```

Os testes rodam em jsdom e não tocam rede nem `.env`: o `vite.config.js` fixa
`VITE_API_BASE_URL` para a suíte e cada teste dubla `services/pdConnectApi.js`.

---

## Estrutura

```text
src/
  components/   AuthNav, AuthenticatedLayout, ProtectedRoute, ThemeToggle, ScrollToTop
  context/      AuthContext (sessão) · ThemeContext (claro/escuro) · BrandingContext (cores)
  lib/          api.js (cliente HTTP + refresh JWT) · roles.js (os 4 atores) · icons.js
  pages/
    auth/       login, esqueci-minha-senha, redefinir-senha (+ _auth-shared.scss)
    app/        painel
    admin/      AdminPage + sections/ (Aparência, Usuários)
  services/     pdConnectApi.js — único caminho de dados do front
  theme/        brandTokens.js — tokens editáveis pelo painel de Aparência
  styles/       variables/ · mixins/ · base/ · components/
  test/         setup.js — bootstrap da suíte
```

---

## Identidade visual

Paleta de marca extraída do site oficial da AC2, tipografia **Inter**:

| Token de marca | Valor |
|---|---|
| Laranja institucional | `#E07B1A` |
| Laranja escuro (hover) | `#B8610F` |
| Laranja claro (destaque) | `#FEF3E7` |
| Navy institucional | `#0B2545` |
| Texto de apoio | `#536070` |

As **superfícies** do tema claro não copiam o site. Ele usa branco puro com
preto puro — 21:1, o máximo da escala e bem acima dos 4,5:1 que a WCAG pede, o
que ofusca em tela grande. A rampa da aplicação fica ~12% abaixo do branco puro
(fundo `#E4E9F0`, cartão `#EFF1F4`, texto `#0F1A28`, borda `#CED6E1`) e ainda
mantém 15:1 no texto.

O laranja de marca também não vira texto direto: sobre superfície clara ele dá
3:1 e reprova o AA. Links, ícones e o botão primário leem
`--accent-primary-text` / `--accent-cta-bg`, que escurecem o tom da marca em
runtime via `color-mix`.

### Troca de cores em tempo real

Nenhum componente usa cor literal — todos leem **CSS custom properties**
declaradas em `styles/base/_globals.scss`. O painel de Aparência sobrescreve
essas properties no `<html>` via `setProperty`, então a mudança repinta a
aplicação inteira sem reload, rebuild ou botão de salvar.

Os tokens têm variáveis **derivadas**: mudar `--accent-primary` recalcula
sozinho `--accent-primary-dim`, `--border-accent`, `--shadow-focus` e
`--shadow-accent`. Cada tema guarda sua própria paleta, persistida em
`localStorage`.

> ⚠️ Os valores padrão vivem em **dois** arquivos que precisam andar juntos:
> `styles/variables/_colors.scss` (o que a aplicação pinta) e `UI_SURFACES` em
> `theme/brandTokens.js` (o que "restaurar padrão AC2" devolve).

---

## Observações

- `.env` não é versionado; só o `.env.example`.
- O login vai sempre para a API (`POST /api/auth/token/`, `GET /api/auth/profile/`)
  na `VITE_API_BASE_URL`. Sem back-end no ar, nada disso responde — e não há
  caminho alternativo que dispense o banco.
- Sessão real em `localStorage`, chave `pdconnect-auth-session-v2`.
- Não existe autocadastro: pesquisadores são cadastrados por um Supervisor e as
  demais contas provisionadas pelo Administrador (RN-A04 / D06).
- Testes em `src/**/*.test.jsx`. Hoje só a `LoginPage` está coberta (item Q6 do
  plano).
