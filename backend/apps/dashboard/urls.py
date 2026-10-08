from django.urls import path

from apps.dashboard.views import IndicadoresView

urlpatterns = [
    path('indicadores/', IndicadoresView.as_view(), name='indicadores'),
]
