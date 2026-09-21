from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.opportunities.views import OportunidadeViewSet

router = DefaultRouter()
router.register('oportunidades', OportunidadeViewSet, basename='oportunidade')

urlpatterns = [path('', include(router.urls))]
