"""
Rotas da API.

Tudo sob `/api/`, JWT em tudo exceto o explicitamente publico. Os nomes de
recurso seguem o glossario do cliente, nao os identificadores internos.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path('admin/', admin.site.urls),

    path('api/', include('apps.accounts.urls')),
    path('api/', include('apps.network.urls')),
    path('api/', include('apps.opportunities.urls')),

    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path(
        'api/docs/',
        SpectacularSwaggerView.as_view(url_name='schema'),
        name='swagger-ui',
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
