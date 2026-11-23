# A imagem do nginx da frente, com a tela ja compilada dentro.
# O contexto do build e a pasta frontend/ (ver deploy/compose.producao.yml), e
# o frontend/.dockerignore deixa de fora node_modules, dist e .env.
# A configuracao do nginx nao entra aqui: o compose a monta de deploy/nginx/templates.

FROM node:24-alpine AS tela

WORKDIR /app/frontend

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# A API fica no mesmo endereco da tela, em /api: o cookie da sessao e de
# primeira parte e a politica de conteudo so libera o proprio site.
ENV VITE_API_BASE_URL=/api
RUN npm run build

FROM nginx:1.28-alpine

COPY --from=tela /app/frontend/dist /usr/share/nginx/html
