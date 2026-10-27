"""
As mensagens que a API devolve chegam a tela como estao escritas.

Por isso o teste le o fonte: toda mensagem de erro de regra de negocio, de
validacao ou de resposta (`detail`) tem acento e nao usa jargao tecnico. Ficam de
fora as mensagens de operacao (configuracao do servidor e comandos de terminal),
que quem le e quem administra o servidor.
"""
import ast
import re
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

RAIZ = Path(settings.BASE_DIR)
PASTAS = ('apps', 'core')
FORA = {'tests', 'migrations', 'management'}
ARQUIVOS_DE_OPERACAO = {'configuracao.py', 'migracoes.py'}

EXCECOES = {
    'ErroDeDominio',
    'AcaoNaoPermitida',
    'RecursoNaoEncontrado',
    'ConflitoDeEstado',
    'ValidationError',
    'PermissionDenied',
    'NotFound',
    'AuthenticationFailed',
}

SEM_ACENTO = re.compile(
    r'\b(nao|ja|voce|sessao|situacao|invalid[oa]s?|possivel|codigo|historico|'
    r'periodo|inicio|decisao|complementacao|organizacao|notificacao|'
    r'recuperacao|redefinicao|alguem|competencia|competencias|necessaria|'
    r'necessarias|analise|criterios?|versao|acao|permissao|informacao)\b',
    re.IGNORECASE,
)
JARGAO = re.compile(r'\b(rerank|fallback|score|embedding|baseline|merge patch|token)\b', re.I)
MARCADOR = re.compile(r'%\([^)]*\)s|\{[^}]*\}')


def _texto(no):
    if isinstance(no, ast.Constant) and isinstance(no.value, str):
        return no.value
    if isinstance(no, ast.JoinedStr):
        return ''.join(
            parte.value if isinstance(parte, ast.Constant) else ' '
            for parte in no.values
        )
    if isinstance(no, ast.BinOp):
        return (_texto(no.left) or '') + (_texto(no.right) or '')
    if isinstance(no, ast.Dict):
        return ' '.join(filter(None, (_texto(valor) for valor in no.values)))
    if isinstance(no, ast.Call) and getattr(no.func, 'id', '') == '_' and no.args:
        return _texto(no.args[0])
    return None


def mensagens_da_api():
    for pasta in PASTAS:
        for arquivo in sorted((RAIZ / pasta).rglob('*.py')):
            if FORA & set(arquivo.parts) or arquivo.name in ARQUIVOS_DE_OPERACAO:
                continue

            arvore = ast.parse(arquivo.read_text(encoding='utf-8'))

            for no in ast.walk(arvore):
                if isinstance(no, ast.Call) and no.args:
                    nome = getattr(no.func, 'attr', getattr(no.func, 'id', None))
                    if nome in EXCECOES and (texto := _texto(no.args[0])):
                        yield f'{arquivo.relative_to(RAIZ)}:{no.lineno}', MARCADOR.sub(' ', texto)

                if isinstance(no, ast.Dict):
                    for chave, valor in zip(no.keys, no.values):
                        if isinstance(chave, ast.Constant) and chave.value == 'detail':
                            if texto := _texto(valor):
                                yield (
                                    f'{arquivo.relative_to(RAIZ)}:{no.lineno}',
                                    MARCADOR.sub(' ', texto),
                                )


class LinguagemDaApiTests(SimpleTestCase):
    def test_o_teste_le_as_mensagens(self):
        self.assertGreater(len(list(mensagens_da_api())), 40)

    def test_mensagens_de_erro_tem_acento(self):
        sem_acento = [
            f'{onde}: {texto}'
            for onde, texto in mensagens_da_api()
            if SEM_ACENTO.search(texto)
        ]

        self.assertEqual(sem_acento, [])

    def test_mensagens_de_erro_nao_usam_jargao(self):
        com_jargao = [
            f'{onde}: {texto}'
            for onde, texto in mensagens_da_api()
            if JARGAO.search(texto)
        ]

        self.assertEqual(com_jargao, [])
