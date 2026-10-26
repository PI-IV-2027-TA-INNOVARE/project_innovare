"""
Rotas da API.

Tudo sob `/api/`, JWT em tudo exceto o explicitamente publico. Os nomes de
recurso seguem o glossario do cliente, nao os identificadores internos.
"""
from django.conf import settings
from django.contrib import admin
from django.urls import include, path

from core.documentacao import DocumentacaoDaApi, EsquemaDaApi

urlpatterns = [
    path(settings.ADMIN_URL, admin.site.urls),

    path('api/', include('apps.accounts.urls')),
    path('api/', include('apps.network.urls')),
    path('api/', include('apps.opportunities.urls')),
    path('api/', include('apps.ai.urls')),
    path('api/', include('apps.audit.urls')),
    path('api/', include('apps.dashboard.urls')),
    path('api/', include('apps.notifications.urls')),
    path('api/', include('apps.platform_settings.urls')),

    path('api/schema/', EsquemaDaApi.as_view(), name='schema'),
    path(
        'api/docs/',
        DocumentacaoDaApi.as_view(url_name='schema'),
        name='swagger-ui',
    ),
]
