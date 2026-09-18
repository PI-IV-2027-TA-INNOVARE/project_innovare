from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.network.views import (
    MembroRedeViewSet,
    PerfilProprioView,
    TitulacaoListView,
)

router = DefaultRouter()
router.register('rede', MembroRedeViewSet, basename='membro-rede')

urlpatterns = [
    path('rede/meu-perfil/', PerfilProprioView.as_view(), name='rede-meu-perfil'),
    path('rede/titulacoes/', TitulacaoListView.as_view(), name='rede-titulacoes'),
    path('', include(router.urls)),
]
