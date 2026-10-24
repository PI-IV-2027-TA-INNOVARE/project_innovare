"""
Views da trilha de auditoria.

So leitura, e so para o Administrador. A view recebe, valida o contrato,
delega e responde.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, views
from rest_framework.generics import ListAPIView
from rest_framework.response import Response

from apps.audit.models import CategoriaEvento, StatusEvento
from apps.audit.rotulos import ROTINA_OCULTA
from apps.audit.serializers import EventoTrilhaSerializer, FiltroTrilhaSerializer
from apps.audit.services.consulta import trilha
from apps.audit.services.leitura import leitura_da_pagina
from core.permissions import EhAdministrador


def _catalogo(choices):
    return [{'valor': valor, 'rotulo': rotulo} for valor, rotulo in choices]


class TrilhaListView(ListAPIView):
    """
    `GET /api/trilha/` - o que aconteceu na plataforma (RF12).

    Sem `post`, `patch` ou `delete`: a trilha e append-only, e quem grava e o
    service que causou o evento. Uma rota de escrita aqui seria a porta por
    onde a trilha deixaria de ser confiavel.
    """

    permission_classes = [permissions.IsAuthenticated, EhAdministrador]
    serializer_class = EventoTrilhaSerializer

    def get_queryset(self):
        filtros = FiltroTrilhaSerializer(data=self.request.query_params)
        filtros.is_valid(raise_exception=True)

        return trilha(**filtros.validated_data)

    def list(self, request, *args, **kwargs):
        """A pagina sai com alvos e atores resolvidos em lote, nao linha a linha."""
        pagina = self.paginate_queryset(self.get_queryset())
        serializer = self.get_serializer(
            pagina,
            many=True,
            context={**self.get_serializer_context(), 'leitura': leitura_da_pagina(pagina)},
        )

        return self.get_paginated_response(serializer.data)


class TrilhaFiltrosView(views.APIView):
    """
    `GET /api/trilha/filtros/` - os valores que os selects da tela oferecem.

    A tela consome o catalogo em vez de manter uma copia das categorias: lista
    copiada envelhece calada no dia em que uma categoria nova nascer no
    modelo, e o Administrador deixa de conseguir filtrar por ela.
    """

    permission_classes = [permissions.IsAuthenticated, EhAdministrador]

    @extend_schema(responses={200: None})
    def get(self, request):
        return Response(
            {
                'categorias': _catalogo(CategoriaEvento.choices),
                'status': _catalogo(StatusEvento.choices),
                'rotina_oculta': {
                    'categoria': CategoriaEvento.CONTA,
                    'tipos': list(ROTINA_OCULTA),
                },
            }
        )
