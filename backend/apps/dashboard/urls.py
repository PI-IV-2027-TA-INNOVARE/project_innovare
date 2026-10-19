from django.urls import path

from apps.dashboard.views import IndicadoresDeIAView, IndicadoresView

urlpatterns = [
    path('indicadores/', IndicadoresView.as_view(), name='indicadores'),
    path(
        'indicadores/ia/',
        IndicadoresDeIAView.as_view(),
        name='indicadores-ia',
    ),
]
