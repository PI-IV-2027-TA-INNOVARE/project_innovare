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

BASE_DIR = Path(__file__).resolve().parent.parent

_ENV_FILE = Path(os.environ.get('PDCONNECT_ENV_FILE', BASE_DIR / '.env'))
config = Config(RepositoryEnv(str(_ENV_FILE))) if _ENV_FILE.exists() else env_config

SECRET_KEY = config('SECRET_KEY', default='dev-only-nao-use-em-producao')
DEBUG = config('DEBUG', default=False, cast=bool)
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

DB_HOST = config('DB_HOST', default='localhost')

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='pdconnect'),
        'USER': config('DB_USER', default='postgres'),
        'PASSWORD': config('DB_PASSWORD', default=''),
        'HOST': DB_HOST,
        'PORT': config('DB_PORT', default='5432'),
        'OPTIONS': {
            'connect_timeout': 10,
            'sslmode': config('DB_SSLMODE', default='prefer'),
        },
    }
}

LOCAL_DB_HOSTS = {'localhost', '127.0.0.1', '::1', ''}

RUNNING_TESTS = (
    'test' in sys.argv
    or 'pytest' in sys.modules
    or os.environ.get('PYTEST_CURRENT_TEST') is not None
)

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
}

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
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='nao-responda@pdconnect.local')
SEND_NOTIFICATION_EMAILS = config('SEND_NOTIFICATION_EMAILS', default=False, cast=bool)

if RUNNING_TESTS:
    EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
    SEND_NOTIFICATION_EMAILS = False

FRONTEND_URL = config('FRONTEND_URL', default='http://localhost:5173')

TOKEN_RECUPERACAO_HORAS = config('TOKEN_RECUPERACAO_HORAS', default=2, cast=int)
TOKEN_CONVITE_HORAS = config('TOKEN_CONVITE_HORAS', default=24, cast=int)

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
AI_MATCH_RERANK_ENABLED = config('AI_MATCH_RERANK_ENABLED', default=False, cast=bool)
AI_MATCH_GEMINI_MODEL = config('AI_MATCH_GEMINI_MODEL', default='gemini-2.5-flash')
GEMINI_API_KEY = config('GEMINI_API_KEY', default='')
AI_CUSTO_TETO_MENSAL_BRL = config('AI_CUSTO_TETO_MENSAL_BRL', default=50.0, cast=float)

if RUNNING_TESTS:
    GEMINI_API_KEY = ''
    AI_MATCH_RERANK_ENABLED = False

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': config('LOG_LEVEL', default='INFO')},
}
