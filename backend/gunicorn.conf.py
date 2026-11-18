"""
O servidor de producao da API: `gunicorn --config gunicorn.conf.py`.

O `runserver` e de desenvolvimento: abre uma thread por pedido, sem limite, e
nao recicla processo. Aqui cada processo atende varios pedidos em threads, o
que serve a esta API, onde o pedido passa a maior parte do tempo esperando o
banco ou a IA.

`WEB_CONCURRENCY` (processos) e `GUNICORN_THREADS` (threads por processo) vem
do ambiente. Cada processo carrega o modelo de comparacao de textos, algumas
centenas de MB: aumentar processos custa memoria; aumentar threads, nao.

As threads nao passam do pool de conexoes do banco (`CONEXOES_MAXIMAS_NO_POOL`
em `core/configuracao.py`): thread sem conexao livre espera 10 s e responde
erro. Processos x threads tambem tem de caber no limite de conexoes do banco.

O `timeout` cobre o pedido que espera a IA: duas tentativas de 45 s, mais a
espera entre elas. Os tetos de linha e de cabecalho recusam o pedido
malformado antes de ele chegar ao Django; o do corpo esta em
`core/middleware.py`.
"""
import os

TETO_DE_THREADS = 10

wsgi_app = 'config.wsgi:application'
bind = '0.0.0.0:' + os.environ.get('PORT', '8000')

worker_class = 'gthread'
workers = int(os.environ.get('WEB_CONCURRENCY', '2'))
threads = min(int(os.environ.get('GUNICORN_THREADS', '8')), TETO_DE_THREADS)

timeout = 120
graceful_timeout = 30
keepalive = 5

max_requests = 2000
max_requests_jitter = 200

limit_request_line = 4094
limit_request_fields = 50
limit_request_field_size = 8190

accesslog = '-'
errorlog = '-'


def post_worker_init(worker):
    """Cada processo aquece o modelo de comparacao de textos ao iniciar."""
    from apps.ai.services.embedding import aquecer_em_segundo_plano

    aquecer_em_segundo_plano()
