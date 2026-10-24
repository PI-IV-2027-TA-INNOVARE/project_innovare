"""
Erro inesperado na API vira JSON 500 - nunca a pagina HTML de debug do Django.

Com `DEBUG=True`, a excecao que o tratador nao conhecia subia ate o Django, que
respondia com a pagina tecnica inteira: SQL, settings, variaveis locais. O
front exibia esse HTML no banner do login. A resposta agora e sempre o mesmo
contrato de erro da API (`detail` + `codigo`); o detalhe tecnico vai para o
log do servidor, nao para quem chamou.
"""
from django.http import Http404
from django.test import SimpleTestCase, override_settings
from rest_framework.permissions import AllowAny
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView

from core.exceptions import ConflitoDeEstado

FALHA_DE_BANCO = 'relation "Usuario" does not exist'


class ViewQueQuebra(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = []
    erro = RuntimeError(FALHA_DE_BANCO)

    def get(self, request):
        raise self.erro


def chamar(erro):
    view = ViewQueQuebra.as_view(erro=erro)
    resposta = view(APIRequestFactory().get('/api/qualquer/'))
    resposta.render()
    return resposta


@override_settings(DEBUG=True)
class ErroInesperadoTests(SimpleTestCase):
    def test_vira_json_500_mesmo_com_debug_ligado(self):
        with self.assertLogs('core.exceptions', level='ERROR'):
            resposta = chamar(RuntimeError(FALHA_DE_BANCO))

        self.assertEqual(resposta.status_code, 500)
        self.assertTrue(resposta['Content-Type'].startswith('application/json'))
        self.assertEqual(resposta.data['codigo'], 'erro_interno')

    def test_detalhe_tecnico_fica_no_log_e_nao_na_resposta(self):
        with self.assertLogs('core.exceptions', level='ERROR') as log:
            resposta = chamar(RuntimeError(FALHA_DE_BANCO))

        self.assertNotIn('Usuario', resposta.content.decode())
        self.assertIn(FALHA_DE_BANCO, '\n'.join(log.output))

    def test_erro_de_dominio_segue_com_status_e_codigo_proprios(self):
        resposta = chamar(ConflitoDeEstado('Ja existe.', 'duplicado'))

        self.assertEqual(resposta.status_code, 409)
        self.assertEqual(resposta.data, {'detail': 'Ja existe.', 'codigo': 'duplicado'})

    def test_erro_conhecido_do_drf_segue_o_padrao(self):
        resposta = chamar(Http404())

        self.assertEqual(resposta.status_code, 404)
