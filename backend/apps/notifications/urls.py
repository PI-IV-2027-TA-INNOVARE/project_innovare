"""
Rotas da caixa de notificacoes.

As estaticas vem antes da que tem parametro. `<int:id_notificacao>` nao casaria
com `nao-lidas`, mas a ordem e a mesma que o resto do projeto segue, e depender
do tipo do conversor para desempatar rota e contrato que ninguem le.
"""
from django.urls import path

from apps.notifications.views import (
    CaixaListView,
    MarcarComoLidaView,
    MarcarTodasComoLidasView,
    NaoLidasView,
)

urlpatterns = [
    path(
        'notificacoes/nao-lidas/',
        NaoLidasView.as_view(),
        name='notificacoes-nao-lidas',
    ),
    path(
        'notificacoes/marcar-todas-lidas/',
        MarcarTodasComoLidasView.as_view(),
        name='notificacoes-marcar-todas-lidas',
    ),
    path(
        'notificacoes/<int:id_notificacao>/lida/',
        MarcarComoLidaView.as_view(),
        name='notificacao-lida',
    ),
    path('notificacoes/', CaixaListView.as_view(), name='notificacoes-list'),
]
