from django.urls import path

from apps.platform_settings.views import TemaView

urlpatterns = [
    path('configuracoes/tema/', TemaView.as_view(), name='configuracao-tema'),
]
