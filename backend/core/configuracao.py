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


AMBIENTE_LOCAL = 'local'
AMBIENTE_PRODUCAO = 'producao'
AMBIENTES = (AMBIENTE_LOCAL, AMBIENTE_PRODUCAO)

VIDA_DA_CONEXAO_EM_PRODUCAO = 600


def ambiente_declarado(valor):
    """
    Normaliza `AMBIENTE` e recusa o que nao reconhece.

    O ambiente governa o acesso ao banco: TLS e reaproveitamento de conexao.
    Um valor com erro de digitacao cairia no padrao local e afrouxaria os dois
    contra um banco de verdade, sem uma linha de aviso - por isso aqui e
    `raise`, e nao `default`.

    `DEBUG` de proposito **nao** entra nessa lista. Derivar `DEBUG` do ambiente
    faria a ausencia de `AMBIENTE` ligar o modo de depuracao, e quem esquece de
    declarar o ambiente num deploy e exatamente quem nao pode receber
    traceback e settings na resposta de erro. O padrao de `DEBUG` segue sendo
    `False`, que erra para o lado seguro.
    """
    ambiente = (valor or '').strip().lower() or AMBIENTE_LOCAL

    if ambiente not in AMBIENTES:
        raise ImproperlyConfigured(
            f'AMBIENTE={valor!r} nao e reconhecido. Use um de: '
            + ', '.join(AMBIENTES)
            + '. O ambiente decide o TLS do banco e o reaproveitamento de '
            'conexao.'
        )

    return ambiente


def vida_da_conexao(ambiente, valor=None, rodando_testes=False, com_pool=False):
    """
    Segundos que a conexao com o banco sobrevive a requisicao (`CONN_MAX_AGE`).

    Em producao o banco esta do outro lado da internet, e o custo de reabrir
    (TCP + TLS + autenticacao no proxy) vem antes da primeira query. Em local
    o Postgres responde na mesma maquina e o padrao do Django ja serve.

    Na suite e sempre zero, qualquer que seja o ambiente: conexao viva no fim
    do teste impede o `DROP` do banco de teste.

    Com pool tambem e zero: o Django recusa os dois juntos, e quem reaproveita
    a conexao passa a ser o pool (`pool_de_conexoes`).
    """
    if rodando_testes or com_pool:
        return 0

    declarado = (valor or '').strip() if isinstance(valor, str) else valor

    if declarado is None or declarado == '':
        return (
            VIDA_DA_CONEXAO_EM_PRODUCAO
            if ambiente == AMBIENTE_PRODUCAO
            else 0
        )

    try:
        return int(declarado)
    except (TypeError, ValueError) as exc:
        raise ImproperlyConfigured(
            f'DB_CONN_MAX_AGE={valor!r} nao e um numero de segundos. '
            'Deixe a chave ausente para usar o padrao do ambiente.'
        ) from exc


VERDADEIROS = {'true', '1', 'yes', 'on', 'sim'}
FALSOS = {'false', '0', 'no', 'off', 'nao'}

ESPERA_POR_CONEXAO_LIVRE_S = 10
CONEXOES_MINIMAS_NO_POOL = 2
CONEXOES_MAXIMAS_NO_POOL = 10


def _booleano(nome, valor):
    if isinstance(valor, bool):
        return valor

    texto = str(valor).strip().lower()

    if texto in VERDADEIROS:
        return True
    if texto in FALSOS:
        return False

    raise ImproperlyConfigured(
        f'{nome}={valor!r} nao e booleano. Use True ou False, ou deixe a chave '
        'ausente para usar o padrao.'
    )


def pool_de_conexoes(valor=None, rodando_testes=False):
    """
    As opcoes do pool de conexoes do Postgres, ou `None` sem pool.

    O pool mantem conexoes abertas no processo e as empresta a qualquer
    thread. Sem ele, o `runserver` - que abre uma thread por requisicao -
    reabre a conexao em toda requisicao, porque a conexao do Django e por
    thread e o `CONN_MAX_AGE` nao atravessa threads. Contra o Neon isso e mais
    de um segundo antes da primeira query.

    A conexao que sai do pool e conferida antes de chegar ao Django
    (`CONN_HEALTH_CHECKS`): uma ida e volta, contra a reconexao inteira que o
    pool evita. Sem a conferencia, conexao que o servidor derrubou por
    ociosidade viraria erro 500.

    Ligado por padrao nos dois ambientes: no Postgres local nao custa nada.
    Na suite, nunca: conexao guardada no pool sobrevive ao teste e impede o
    `DROP` do banco de teste.
    """
    if rodando_testes:
        return None

    declarado = valor.strip() if isinstance(valor, str) else valor

    if declarado not in (None, '') and not _booleano('DB_POOL', declarado):
        return None

    return {
        'min_size': CONEXOES_MINIMAS_NO_POOL,
        'max_size': CONEXOES_MAXIMAS_NO_POOL,
        'timeout': ESPERA_POR_CONEXAO_LIVRE_S,
    }


HSTS_EM_PRODUCAO = 31536000


def seguranca_de_transporte(ambiente, debug=False, rodando_testes=False):
    """
    O endurecimento de transporte, condicionado ao ambiente.

    `manage.py check --deploy` cobrava quatro coisas, e as quatro eram a mesma
    ausencia: nada no `settings.py` endurecia o transporte. Sem
    `SECURE_SSL_REDIRECT`, quem chega por `http://` manda e-mail e senha em
    claro; sem `*_COOKIE_SECURE`, o cookie acompanha essa viagem; sem HSTS, o
    navegador repete o erro na visita seguinte.

    **Condicionado ao ambiente**, pelo mesmo motivo de `vida_da_conexao`:
    redirect de HTTPS em `runserver` quebra o desenvolvimento sem proteger
    ninguem, e cookie `Secure` nao viaja em `http://localhost` - o login
    simplesmente pararia de funcionar local. Quem garante que "producao" nao
    seja alcancada por erro de digitacao e o `raise` de `ambiente_declarado`.

    `SECURE_PROXY_SSL_HEADER` nao e enfeite: atras de um proxy que termina o
    TLS, o Django ve `http` e o redirect entraria em laco infinito.

    `AUTH_COOKIE_SECURE` e o mesmo cuidado para o cookie do token de renovacao
    (`apps/accounts/cookie_de_sessao.py`).

    `nosniff` e `X_FRAME_OPTIONS` valem nos dois ambientes - nao dependem de
    TLS e nao atrapalham o local.

    Sob teste o redirect e o HSTS saem: a suite fala `http://testserver`, e com
    redirect ligado todo teste de API receberia 301 em vez da resposta.

    `DEBUG` ligado tambem desarma, e nao e concessao: `AMBIENTE=producao` com
    `DEBUG=True` e maquina de desenvolvimento apontada para o banco de verdade,
    e e o que o `.env` da equipe diz hoje. Redirecionar ali derruba o
    `runserver`, que nao fala TLS. `DEBUG=True` e a declaracao inequivoca de
    "isto nao e um deploy" - a propria `security.W018` do Django parte dessa
    leitura.
    """
    endurecido = (
        ambiente == AMBIENTE_PRODUCAO and not debug and not rodando_testes
    )

    return {
        'SECURE_SSL_REDIRECT': endurecido,
        'SESSION_COOKIE_SECURE': endurecido,
        'CSRF_COOKIE_SECURE': endurecido,
        'AUTH_COOKIE_SECURE': endurecido,
        'SECURE_HSTS_SECONDS': HSTS_EM_PRODUCAO if endurecido else 0,
        'SECURE_HSTS_INCLUDE_SUBDOMAINS': endurecido,
        'SECURE_HSTS_PRELOAD': endurecido,
        'SECURE_PROXY_SSL_HEADER': ('HTTP_X_FORWARDED_PROTO', 'https'),
        'SECURE_CONTENT_TYPE_NOSNIFF': True,
        'X_FRAME_OPTIONS': 'DENY',
        'SESSION_COOKIE_HTTPONLY': True,
    }


def ambiente_incoerente(ambiente, debug):
    """
    Se `AMBIENTE` e `DEBUG` se contradizem.

    `producao` com `DEBUG=True` e o unico par que mente: o ambiente diz que o
    banco e de verdade (TLS exigido, conexao reaproveitada) e o `DEBUG` diz que
    traceback e settings podem ir na resposta de erro. As duas coisas nao
    convivem num mesmo host.

    Nao e `raise`: travar a subida de quem esta desenvolvendo com esse `.env`
    atrapalharia mais do que protege, e o endurecimento de transporte ja se
    desarma sozinho nesse caso (`seguranca_de_transporte`). E aviso para quem
    nao sabe que esta nessa situacao.
    """
    return ambiente == AMBIENTE_PRODUCAO and bool(debug)


def exigir_ambiente_coerente(ambiente, debug, rodando_testes=False):
    """
    Recusa `AMBIENTE=producao` com `DEBUG=True`.

    Era o `.env` de desenvolvimento apontado para o banco de verdade: a pagina
    de erro detalhada saia para quem pedisse e os anexos ficavam abertos.
    Desenvolver e no banco local; o banco remoto e de homologacao, sem DEBUG.
    A suite nao e barrada: o tripwire ja troca o banco remoto por SQLite.
    """
    if rodando_testes or not ambiente_incoerente(ambiente, debug):
        return

    raise ImproperlyConfigured(
        'AMBIENTE=producao com DEBUG=True. Para desenvolver, aponte o '
        'backend/.env para o banco local (AMBIENTE=local); o banco remoto e '
        'de homologacao, com DEBUG=False.'
    )


CAMINHO_PADRAO_DO_ADMIN = 'admin'


def caminho_do_admin(valor, ambiente=AMBIENTE_LOCAL):
    """
    O endereco do `/admin/` do Django, sem barra no inicio e com uma no fim.

    Fica em configuracao para nao ser o endereco padrao que todo robo tenta
    (S8): em producao o padrao e recusado. Recusa tambem o vazio, que poria o
    admin na raiz, e o que comeca por `api`, que disputaria rota com a API.
    """
    caminho = (valor or '').strip().strip('/')

    if ambiente == AMBIENTE_PRODUCAO and caminho == CAMINHO_PADRAO_DO_ADMIN:
        raise ImproperlyConfigured(
            'Em producao o /admin/ do Django nao fica no endereco padrao. '
            'Defina ADMIN_URL com um caminho proprio, como painel-tecnico-7f3a.'
        )

    if not caminho:
        raise ImproperlyConfigured(
            'ADMIN_URL vazio poria o /admin/ do Django na raiz do site. '
            'Use um caminho, como painel-tecnico-7f3a.'
        )

    if caminho.split('/')[0] == 'api':
        raise ImproperlyConfigured(
            f'ADMIN_URL={valor!r} disputa rota com a API. Escolha outro caminho.'
        )

    return f'{caminho}/'
