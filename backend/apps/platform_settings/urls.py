from django.urls import path

from apps.platform_settings.views import ContatosSuporteView, PrivacidadeView, TemaView

urlpatterns = [
    path('privacidade/', PrivacidadeView.as_view(), name='privacidade'),
    path('configuracoes/tema/', TemaView.as_view(), name='configuracao-tema'),
    path(
        'configuracoes/contatos-suporte/',
        ContatosSuporteView.as_view(),
        name='configuracao-contatos-suporte',
    ),
]
