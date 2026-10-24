from django.urls import path

from apps.ai.views import CriteriosPreAnaliseView, SaudeView

urlpatterns = [
    path('ia/saude/', SaudeView.as_view(), name='ia-saude'),
    path(
        'ia/criterios/',
        CriteriosPreAnaliseView.as_view(),
        name='ia-criterios',
    ),
]
