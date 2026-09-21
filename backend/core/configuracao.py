"""
Validacao das settings que nao podem chegar a producao pela metade.

Por que nao fica dentro do `settings.py`: la e codigo de modulo, executado no
import. Um `raise` ali so seria alcancavel por subprocesso, e regra de seguranca
sem teste e regra que ninguem percebe quando quebra.
"""
from django.core.exceptions import ImproperlyConfigured

CHAVE_DE_DESENVOLVIMENTO = 'dev-only-nao-use-em-producao'

COMO_GERAR = (
    'Gere a sua com: python -c "from django.core.management.utils import '
    'get_random_secret_key as k; print(k())"'
)


def chave_de_assinatura(valor, debug):
    """
    Devolve a `SECRET_KEY` em uso; recusa a de desenvolvimento em producao.

    Ela assina os tokens de sessao. Com a chave versionada, qualquer pessoa que
    leia o repositorio forja um token de qualquer usuario - por isso, com
    `DEBUG` desligado, a aplicacao para de subir em vez de seguir em silencio.
    """
    chave = (valor or '').strip() or CHAVE_DE_DESENVOLVIMENTO

    if not debug and chave == CHAVE_DE_DESENVOLVIMENTO:
        raise ImproperlyConfigured(
            'SECRET_KEY ausente ou com o valor de desenvolvimento, e DEBUG '
            'esta desligado. Essa chave assina os tokens de sessao: subir '
            'assim deixa quem le o codigo forjar token de qualquer usuario. '
            + COMO_GERAR
        )

    return chave
