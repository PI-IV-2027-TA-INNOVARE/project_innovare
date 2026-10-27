"""Configuracao do Celery para as tarefas demoradas do produto.

A fila e opcional: sem `CELERY_BROKER_URL` o processo sobe sem worker e as
operacoes que dependem dela seguem pelo caminho sincrono. O worker executa a
pre-analise quando `PREANALISE_ASSINCRONA=True`; o beat agenda a retencao LGPD
diaria (`audit.aplicar_retencao`) e, se configurado, as demais tarefas
periodicas.
"""
import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('innovare')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
