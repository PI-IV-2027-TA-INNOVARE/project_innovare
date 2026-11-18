import os
import sys

from django.apps import AppConfig


class AiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.ai'
    label = 'ai'
    verbose_name = 'Execucoes de IA'

    def ready(self):
        from apps.ai.services import embedding

        if embedding.deve_aquecer(sys.argv, os.environ):
            embedding.aquecer_em_segundo_plano()
