# P&D Connect em produção — VPS com Docker

O passo a passo para subir o P&D Connect numa VPS Linux (a da KingHost, ou
qualquer outra com Ubuntu e acesso root). Tudo roda em containers, com o
`compose.producao.yml` desta pasta:

| Serviço | O que faz | Exposto? |
|---|---|---|
| `nginx` | HTTPS, a tela compilada, `/static/` e o encaminhamento de `/api/` e do admin para a API | Sim, portas 80 e 443 |
| `backend` | A API Django no gunicorn | Não, só para o nginx |
| `worker` | O Celery: pré-análise em segundo plano e retenção de dados | Não |
| `beat` | O agendador das rotinas diárias (retenção às 3h, sessões vencidas às 3h30) | Não |
| `redis` | Os contadores dos limites de pedidos e a fila do Celery | Não, nem para o nginx |
| `certbot` | Renova o certificado do Let's Encrypt | Não |
| `estaticos` | Roda o `collectstatic` na subida e encerra | Não |

O banco é o do `backend/.env` (hoje o Neon). O compose não sobe PostgreSQL.

**O desenvolvimento não muda.** O `docker-compose.yml` da raiz, o `runserver` e
o `backend/.env` com `AMBIENTE=local` continuam valendo na máquina de quem
desenvolve. Este compose só entra quando chamado com
`-f deploy/compose.producao.yml`, e é ele que põe a aplicação em produção:
`AMBIENTE=producao`, `DEBUG=False`, `NUM_PROXIES=1` e o Redis vêm dele e vencem o
que estiver no `backend/.env`.

---

## 1. A máquina

- **Plano:** pelo menos 4 GB de memória. Medido em 20/11/2026, a API com os dois
  processos e o modelo de comparação de textos ocupa 1,5 GB, e a pilha inteira
  fica perto de 1,8 GB. A imagem do backend tem 3,2 GB em disco.
- **Sistema:** Ubuntu 24.04 LTS.
- **Docker:** Docker Engine com o plugin `compose`, pelo repositório oficial
  ([instruções](https://docs.docker.com/engine/install/ubuntu/)).
- **Acesso:** um usuário com `sudo`, SSH só por chave, sem senha e sem root:

  ```bash
  # /etc/ssh/sshd_config
  PasswordAuthentication no
  PermitRootLogin no
  ```

- **Firewall:** só 22, 80 e 443.

  ```bash
  sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
  sudo ufw enable
  sudo apt install -y unattended-upgrades fail2ban
  ```

  O Docker abre as portas que publica sem passar pelo `ufw`. Por isso o compose
  só publica 80 e 443: a API e o Redis não têm porta no servidor.

- **DNS:** um registro `A` do domínio apontando para o IP da VPS.

## 2. Os dois arquivos de ambiente

```bash
git clone <repositório> pdconnect && cd pdconnect
cp deploy/.env.example deploy/.env
cp backend/.env.example backend/.env
chmod 600 deploy/.env backend/.env
```

**`deploy/.env`** — lido pelo compose: `DOMINIO`, `ADMIN_URL`, `REDIS_SENHA` e
`CERTBOT_EMAIL`. Os comentários do `.env.example` dizem o formato de cada um.

**`backend/.env`** — os segredos da aplicação. Em produção, preencha:

| Chave | Valor |
|---|---|
| `SECRET_KEY` | Uma nova, só deste servidor: `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_SSLMODE` | O banco de produção. No Neon, o host com `-pooler` e `DB_SSLMODE=require` |
| `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | O SMTP. `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend` |
| `SEND_NOTIFICATION_EMAILS` | `True` para o Demandante receber as decisões por e-mail |
| `GEMINI_API_KEY` e as chaves do catálogo de IA | As de produção |

Não precisam estar no `backend/.env`, porque o compose já define:
`AMBIENTE`, `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`,
`ADMIN_URL`, `AUTH_COOKIE_SAMESITE`, `NUM_PROXIES`, `CACHE_URL`,
`CELERY_BROKER_URL` e `PREANALISE_ASSINCRONA`.

## 3. Primeira subida

```bash
set -a; . deploy/.env; set +a
alias dc='docker compose -f deploy/compose.producao.yml'

dc up -d --build
dc run --rm backend python manage.py migrate
```

No Neon, a migration vai pelo host **sem** `-pooler`:
`dc run --rm -e DB_HOST=<host sem -pooler> backend python manage.py migrate`.

**Certificado.** O nginx sobe sem certificado e já atende o desafio do Let's
Encrypt na porta 80. Peça o primeiro e recarregue o nginx:

```bash
dc run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMINIO" --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email
dc exec nginx nginx -s reload
```

Daí em diante o serviço `certbot` tenta renovar a cada 12 horas, e o nginx lê o
certificado novo em até uma hora, sem recarregar.

**Conferência e primeiro Administrador:**

```bash
dc exec backend python manage.py check --deploy
dc exec backend python manage.py createsuperuser
```

O `check --deploy` tem de sair sem nenhum aviso.

## 4. Atualizar

```bash
git pull
dc up -d --build
dc run --rm backend python manage.py migrate
```

Publique sempre a partir do `main`, com o CI verde.

## 5. Backup dos anexos

Os anexos ficam no volume `pdconnect-producao_media`, no disco da VPS. Copie
todo dia para fora dela. Exemplo com `cron`, gerando um `.tgz` para depois
enviar ao destino externo:

```bash
docker run --rm -v pdconnect-producao_media:/dados:ro -v /var/backups/pdconnect:/destino \
  alpine tar czf /destino/anexos-$(date +%F).tgz -C /dados .
```

## 6. Dia a dia

```bash
dc ps                     # quem está no ar
dc logs -f backend        # logs da API (cada serviço guarda até 5 x 10 MB)
dc restart backend        # depois de mudar o backend/.env
```

A rota pública `https://<domínio>/api/privacidade/` passa pela API e pelo
banco, então serve de sonda para um monitor de disponibilidade externo.

---

## O que foi conferido

Em 20/11/2026 a pilha subiu inteira numa máquina de teste, com banco fictício e
certificado próprio:

- a tela, a volta para o `index.html` nas rotas do React, os `/assets/` com
  cache longo, o `/static/` do admin, a API e o admin no caminho do `ADMIN_URL`;
- os cabeçalhos de segurança da tela (HSTS, `X-Frame-Options`,
  `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`);
- HTTP virando HTTPS, o desafio do certificado passando, host desconhecido sem
  resposta, aperto de TLS recusado para outro nome e a porta 8000 fechada;
- a trava de entrada: a 11ª tentativa no mesmo minuto recebeu 429 mesmo com um
  `X-Forwarded-For` forjado diferente em cada pedido;
- o Redis recusando pedido sem senha, o worker e o agendador conectados, a API
  rodando como usuário sem privilégio e o `check --deploy` sem aviso.

Os testes em `backend/core/tests/test_implantacao_na_vps.py` travam essas regras
no compose e no nginx.
