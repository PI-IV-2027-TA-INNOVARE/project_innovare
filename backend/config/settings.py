"""
Settings do P&D Connect.

Camadas e mandatos: ver `AGENTS.md` na raiz do repositorio.
Dominio, atores e linguagem ubiqua: ver `CONTEXT.md`.
"""
import os
import sys
from datetime import timedelta
from pathlib import Path

from decouple import Config, RepositoryEnv, config as env_config

from core.configuracao import (
    AMBIENTE_PRODUCAO,
    ambiente_declarado,
    caminho_do_admin,
    chave_de_assinatura,
    exigir_ambiente_coerente,
    pool_de_conexoes,
    seguranca_de_transporte,
    vida_da_conexao,
)

BASE_DIR = Path(__file__).resolve().parent.parent

_ENV_FILE = Path(os.environ.get('PDCONNECT_ENV_FILE', BASE_DIR / '.env'))
config = Config(RepositoryEnv(str(_ENV_FILE))) if _ENV_FILE.exists() else env_config

RUNNING_TESTS = (
    'test' in sys.argv
    or 'pytest' in sys.modules
    or os.environ.get('PYTEST_CURRENT_TEST') is not None
)

AMBIENTE = ambiente_declarado(config('AMBIENTE', default=''))
EM_PRODUCAO = AMBIENTE == AMBIENTE_PRODUCAO

DEBUG = config('DEBUG', default=False, cast=bool)
SECRET_KEY = chave_de_assinatura(config('SECRET_KEY', default=''), DEBUG)

exigir_ambiente_coerente(AMBIENTE, DEBUG, rodando_testes=RUNNING_TESTS)

globals().update(seguranca_de_transporte(AMBIENTE, DEBUG, RUNNING_TESTS))
"""
Endurecimento de transporte (HTTPS, cookie seguro, HSTS, nosniff, anti-frame).

Vem de `core/configuracao.py` em vez de uma lista aqui porque e regra de
seguranca, e regra de seguranca sem teste e regra que ninguem percebe quando
quebra - o mesmo motivo que tirou a chave de assinatura deste arquivo.
"""
ALLOWED_HOSTS = [
    h.strip()
    for h in config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')
    if h.strip()
]

DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'drf_spectacular',
]

LOCAL_APPS = [
    'core',
    'apps.accounts',
    'apps.organizations',
    'apps.network',
    'apps.platform_settings',
    'apps.opportunities',
    'apps.ai',
    'apps.copilot',
    'apps.competencies',
    'apps.matching',
    'apps.maturity',
    'apps.decisions',
    'apps.audit',
    'apps.notifications',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'core.middleware.MedidorDeDesempenho',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in config(
        'CORS_ALLOWED_ORIGINS',
        default='http://localhost:5173,http://127.0.0.1:5173',
    ).split(',')
    if o.strip()
]

CORS_EXPOSE_HEADERS = ['Content-Disposition']

CORS_ALLOW_CREDENTIALS = True
"""
O front manda o cookie do token de renovacao para as rotas de acesso. O
navegador so aceita credencial com origem nomeada, e e a lista acima.
"""

AUTH_COOKIE_SAMESITE = config('AUTH_COOKIE_SAMESITE', default='') or 'Lax'
"""
`Lax` quando front e API ficam no mesmo site (o mesmo dominio, ou o proxy do
Vite em desenvolvimento). Em dominios diferentes, `None` - que o navegador so
aceita com HTTPS.
"""

DB_HOST = config('DB_HOST', default='localhost')

POOL_DO_BANCO = pool_de_conexoes(
    config('DB_POOL', default=None), rodando_testes=RUNNING_TESTS
)

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='pdconnect'),
        'USER': config('DB_USER', default='postgres'),
        'PASSWORD': config('DB_PASSWORD', default=''),
        'HOST': DB_HOST,
        'PORT': config('DB_PORT', default='5432'),
        'CONN_MAX_AGE': vida_da_conexao(
            AMBIENTE,
            config('DB_CONN_MAX_AGE', default=None),
            rodando_testes=RUNNING_TESTS,
            com_pool=POOL_DO_BANCO is not None,
        ),
        'CONN_HEALTH_CHECKS': True,
        'DISABLE_SERVER_SIDE_CURSORS': True,
        'OPTIONS': {
            'connect_timeout': 10,
            'sslmode': config(
                'DB_SSLMODE', default='require' if EM_PRODUCAO else 'prefer'
            ),
            **({'pool': POOL_DO_BANCO} if POOL_DO_BANCO else {}),
        },
    }
}

LOCAL_DB_HOSTS = {'localhost', '127.0.0.1', '::1', ''}

DB_HOST_IS_REMOTE = DB_HOST.strip().lower() not in LOCAL_DB_HOSTS

if RUNNING_TESTS and DB_HOST_IS_REMOTE:
    DATABASES['default'] = {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
    sys.stderr.write(
        '[seguranca] DB_HOST remoto (' + DB_HOST + ') detectado durante os '
        'testes. Usando SQLite em memoria; o banco remoto nao sera tocado.\n'
    )

REST_FRAMEWORK = {
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'apps.accounts.authentication.AutenticacaoJWTComSituacao',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.PaginacaoPadrao',
    'PAGE_SIZE': 20,
    'EXCEPTION_HANDLER': 'core.exceptions.tratador_de_erro',
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
        'core.limites.LimiteDaIA',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': config('THROTTLE_ANON', default='60/min'),
        'user': config('THROTTLE_USER', default='240/min'),
        'login': config('THROTTLE_LOGIN', default='10/min'),
        'recuperacao': config('THROTTLE_RECUPERACAO', default='5/hour'),
        'redefinicao': config('THROTTLE_REDEFINICAO', default='10/hour'),
    },
    'NUM_PROXIES': config('NUM_PROXIES', default=0, cast=int),
    'SCHEMA_COERCE_PATH_PK': False,
}

LIMITE_DA_IA = config('THROTTLE_IA', default='') or '30/hour'
"""
Pedidos que chamam a IA, por pessoa, somados entre as rotas (`core/limites.py`).
"""

if RUNNING_TESTS:
    REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = dict.fromkeys(
        REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
    )
    LIMITE_DA_IA = None

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(
        minutes=config('JWT_ACCESS_MINUTES', default=30, cast=int)
    ),
    'REFRESH_TOKEN_LIFETIME': timedelta(
        days=config('JWT_REFRESH_DAYS', default=1, cast=int)
    ),
    'USER_ID_FIELD': 'id_usuario',
    'USER_ID_CLAIM': 'user_id',
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'P&D Connect API',
    'DESCRIPTION': (
        'API do P&D Connect - da entrada da oportunidade a decisao do '
        'Supervisor. Vocabulario conforme CONTEXT.md secao 4.'
    ),
    'VERSION': '2.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'ENUM_NAME_OVERRIDES': {
        'PapelEnum': 'apps.accounts.models.Papel',
        'SituacaoContaEnum': 'apps.accounts.models.SituacaoConta',
        'PapelNaRedeEnum': 'apps.network.models.PapelNaRede',
        'SituacaoMembroEnum': 'apps.network.models.SituacaoMembro',
        'SituacaoOportunidadeEnum': 'apps.opportunities.models.SituacaoOportunidade',
        'PrioridadeEnum': 'apps.opportunities.models.PrioridadeOportunidade',
        'NivelDimensaoEnum': 'apps.maturity.models.NivelDimensao',
    },
}

AUTH_USER_MODEL = 'accounts.Usuario'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 8},
    },
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'pt-br'
TIME_ZONE = config('TIME_ZONE', default='America/Sao_Paulo')
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

STATIC_URL = 'static/'
ANEXO_TAMANHO_MAXIMO_MB = config('ANEXO_TAMANHO_MAXIMO_MB', default=10, cast=int)
ANEXO_TIPOS_ACEITOS = tuple(
    config(
        'ANEXO_TIPOS_ACEITOS',
        default=(
            'application/pdf,image/png,image/jpeg,text/plain,text/csv,'
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document,'
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ),
    ).split(',')
)

MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

EMAIL_BACKEND = config(
    'EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend'
)
EMAIL_HOST = config('EMAIL_HOST', default='')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_USE_SSL = config('EMAIL_USE_SSL', default=False, cast=bool)
EMAIL_TIMEOUT = config('EMAIL_TIMEOUT', default=10, cast=int)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='nao-responda@pdconnect.local')
SEND_NOTIFICATION_EMAILS = config('SEND_NOTIFICATION_EMAILS', default=False, cast=bool)

if RUNNING_TESTS:
    EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
    SEND_NOTIFICATION_EMAILS = False

FRONTEND_URL = config('FRONTEND_URL', default='http://localhost:5173')

ADMIN_URL = caminho_do_admin(config('ADMIN_URL', default='admin'), AMBIENTE)

TOKEN_RECUPERACAO_HORAS = config('TOKEN_RECUPERACAO_HORAS', default=2, cast=int)
TOKEN_CONVITE_HORAS = config('TOKEN_CONVITE_HORAS', default=24, cast=int)

SEARCH_EMBEDDING_ENABLED = config('SEARCH_EMBEDDING_ENABLED', default=True, cast=bool)
SEARCH_EMBEDDING_DIMENSION = config('SEARCH_EMBEDDING_DIMENSION', default=384, cast=int)
SEARCH_EMBEDDING_MODEL = config(
    'SEARCH_EMBEDDING_MODEL',
    default='sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
)
AI_MATCH_WEIGHT_SEMANTIC = config('AI_MATCH_WEIGHT_SEMANTIC', default=0.45, cast=float)
AI_MATCH_WEIGHT_LEXICAL = config('AI_MATCH_WEIGHT_LEXICAL', default=0.20, cast=float)
AI_MATCH_WEIGHT_AREA = config('AI_MATCH_WEIGHT_AREA', default=0.25, cast=float)
AI_MATCH_WEIGHT_AVAILABILITY = config('AI_MATCH_WEIGHT_AVAILABILITY', default=0.10, cast=float)
AI_MATCH_MIN_SCORE = config('AI_MATCH_MIN_SCORE', default=0.26, cast=float)
AI_MATCH_PESO_DESEJAVEL = config('AI_MATCH_PESO_DESEJAVEL', default=0.5, cast=float)
AI_MATCH_LIMITE_SUGESTOES = config('AI_MATCH_LIMITE_SUGESTOES', default=10, cast=int)
AI_MATCH_COBERTURA_MINIMA = config('AI_MATCH_COBERTURA_MINIMA', default=0.2, cast=float)
AI_MATCH_FATOR_DISPONIBILIDADE = {
    'integral': config('AI_MATCH_DISP_INTEGRAL', default=1.0, cast=float),
    'parcial': config('AI_MATCH_DISP_PARCIAL', default=0.6, cast=float),
    'pontual': config('AI_MATCH_DISP_PONTUAL', default=0.3, cast=float),
    'indisponivel': config('AI_MATCH_DISP_INDISPONIVEL', default=0.0, cast=float),
}
AI_MATCH_RERANK_ENABLED = config('AI_MATCH_RERANK_ENABLED', default=False, cast=bool)
AI_MATCH_GEMINI_MODEL = config('AI_MATCH_GEMINI_MODEL', default='gemini-2.5-flash')
AI_GEMINI_TEMPERATURA = config('AI_GEMINI_TEMPERATURA', default=0.3, cast=float)
AI_GEMINI_MAX_TOKENS_SAIDA = config(
    'AI_GEMINI_MAX_TOKENS_SAIDA', default=8192, cast=int
)
AI_GEMINI_TIMEOUT_S = config('AI_GEMINI_TIMEOUT_S', default=45, cast=float)
AI_GEMINI_TENTATIVAS = config('AI_GEMINI_TENTATIVAS', default=2, cast=int)
AI_GEMINI_ESPERA_INICIAL_S = config(
    'AI_GEMINI_ESPERA_INICIAL_S', default=2.0, cast=float
)
AI_GEMINI_ORCAMENTO_RACIOCINIO = config(
    'AI_GEMINI_ORCAMENTO_RACIOCINIO', default=1024, cast=int
)
GEMINI_API_KEY = config('GEMINI_API_KEY', default='')
AI_CUSTO_TETO_MENSAL_BRL = config('AI_CUSTO_TETO_MENSAL_BRL', default=50.0, cast=float)
AI_CUSTO_TETO_POR_OPORTUNIDADE_BRL = config(
    'AI_CUSTO_TETO_POR_OPORTUNIDADE_BRL', default=0.0, cast=float
)
DESEMPENHO_LIMITE_MS = config('DESEMPENHO_LIMITE_MS', default=3000, cast=int)
AI_CUSTO_ALERTA_PERCENTUAL = config(
    'AI_CUSTO_ALERTA_PERCENTUAL', default=80, cast=int
)
AI_CUSTO_ENTRADA_BRL_POR_MILHAO = config(
    'AI_CUSTO_ENTRADA_BRL_POR_MILHAO', default=0.0, cast=float
)
AI_CUSTO_SAIDA_BRL_POR_MILHAO = config(
    'AI_CUSTO_SAIDA_BRL_POR_MILHAO', default=0.0, cast=float
)

PROMPT_SISTEMA_PIPE = Path(
    config(
        'PROMPT_SISTEMA_PIPE',
        default=str(BASE_DIR.parent / 'IA' / 'Prompt_Gemini_PIPE_Jornada_Fase1_v2.txt'),
    )
)

BASE_CONHECIMENTO_PIPE = Path(
    config(
        'BASE_CONHECIMENTO_PIPE',
        default=str(
            BASE_DIR.parent / 'IA' / 'Colinha_IA_PIPE_Jornada_Fase1_PD_Connect_v2.json'
        ),
    )
)

if RUNNING_TESTS:
    GEMINI_API_KEY = ''
    AI_MATCH_RERANK_ENABLED = False
    SEARCH_EMBEDDING_ENABLED = False

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': config('LOG_LEVEL', default='INFO')},
}
