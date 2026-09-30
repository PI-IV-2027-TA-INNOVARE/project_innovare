from django.urls import path

from apps.audit.views import TrilhaFiltrosView, TrilhaListView

urlpatterns = [
    path('trilha/filtros/', TrilhaFiltrosView.as_view(), name='trilha-filtros'),
    path('trilha/', TrilhaListView.as_view(), name='trilha-list'),
]
