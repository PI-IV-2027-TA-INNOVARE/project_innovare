from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts.views import (
    AlterarSenhaView,
    CatalogoPermissoesView,
    EsqueciSenhaView,
    LoginView,
    LogoutView,
    PerfilView,
    RedefinirSenhaView,
    RefreshView,
    UsuarioViewSet,
)

router = DefaultRouter()
router.register('usuarios', UsuarioViewSet, basename='usuario')

urlpatterns = [
    path('auth/token/', LoginView.as_view(), name='auth-token'),
    path('auth/token/refresh/', RefreshView.as_view(), name='auth-token-refresh'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('auth/profile/', PerfilView.as_view(), name='auth-profile'),
    path('auth/forgot-password/', EsqueciSenhaView.as_view(), name='auth-forgot-password'),
    path('auth/reset-password/', RedefinirSenhaView.as_view(), name='auth-reset-password'),
    path('auth/change-password/', AlterarSenhaView.as_view(), name='auth-change-password'),
    path('permissoes/catalogo/', CatalogoPermissoesView.as_view(), name='permissoes-catalogo'),
    path('', include(router.urls)),
]
