"""
A camada de servico e tipada - e continua tipada.

O §7.3 do plano exige type hint em toda assinatura publica. Sem um teste, a
exigencia vale ate o primeiro `execute()` escrito com pressa: a anotacao nao
falta em voz alta, nada quebra, e a camada volta a ser `dados` e `ator` sem
contrato. Este caso varre os servicos de verdade, pelo import, e cobra.

Checa a *presenca* da anotacao, nao o tipo: anotacao sob `TYPE_CHECKING` e
string em tempo de execucao e resolve-la aqui obrigaria a importar em runtime
o que existe so para o checador.
"""
import importlib
import inspect
import pkgutil

from django.conf import settings
from django.test import SimpleTestCase

SUFIXO_DE_SERVICO = 'Service'


def modulos_de_servico():
    for app in settings.LOCAL_APPS:
        try:
            pacote = importlib.import_module(f'{app}.services')
        except ModuleNotFoundError:
            continue

        yield pacote

        for info in pkgutil.iter_modules(pacote.__path__):
            yield importlib.import_module(f'{app}.services.{info.name}')


def servicos():
    vistos = set()

    for modulo in modulos_de_servico():
        for nome, objeto in vars(modulo).items():
            if not inspect.isclass(objeto) or not nome.endswith(SUFIXO_DE_SERVICO):
                continue
            if objeto in vistos:
                continue
            vistos.add(objeto)
            yield objeto


class TipagemDosServicosTests(SimpleTestCase):
    def test_existem_servicos_a_conferir(self):
        """Rede de seguranca do proprio teste: descoberta vazia nao passa calada."""
        self.assertGreaterEqual(len(list(servicos())), 15)

    def test_todo_servico_tem_execute(self):
        for servico in servicos():
            with self.subTest(servico=servico.__name__):
                self.assertTrue(
                    callable(getattr(servico, 'execute', None)),
                    f'{servico.__name__} nao expoe execute().',
                )

    def test_todo_execute_declara_os_tipos_dos_parametros(self):
        for servico in servicos():
            assinatura = inspect.signature(servico.execute)

            for nome, parametro in assinatura.parameters.items():
                if nome == 'self':
                    continue

                with self.subTest(servico=servico.__name__, parametro=nome):
                    self.assertIsNot(
                        parametro.annotation,
                        inspect.Parameter.empty,
                        f'{servico.__name__}.execute: `{nome}` sem type hint.',
                    )

    def test_todo_execute_declara_o_tipo_de_retorno(self):
        for servico in servicos():
            with self.subTest(servico=servico.__name__):
                self.assertIsNot(
                    inspect.signature(servico.execute).return_annotation,
                    inspect.Signature.empty,
                    f'{servico.__name__}.execute sem tipo de retorno.',
                )

    def test_construtor_com_dependencia_declara_o_contrato(self):
        """
        Injecao por construtor so serve se o parametro disser *o que* recebe.

        `enviador` anotado com `EnviadorDeEmail` e o que diz a quem implementa
        um transporte novo qual e o contrato a cumprir.
        """
        for servico in servicos():
            construtor = servico.__init__

            if construtor is object.__init__:
                continue

            for nome, parametro in inspect.signature(construtor).parameters.items():
                if nome == 'self':
                    continue

                with self.subTest(servico=servico.__name__, parametro=nome):
                    self.assertIsNot(
                        parametro.annotation,
                        inspect.Parameter.empty,
                        f'{servico.__name__}.__init__: `{nome}` sem type hint.',
                    )
