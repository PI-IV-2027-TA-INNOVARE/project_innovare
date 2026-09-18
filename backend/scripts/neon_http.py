"""
Cliente minimo do endpoint SQL do Neon (HTTPS, porta 443).

Existe porque a porta 5432 esta bloqueada de saida na rede onde este backend
nasceu, e sem ela nao ha `manage.py migrate` nem `createsuperuser` contra o
Neon. Ver `README.md`, secao "Banco".

NAO use isto em codigo de producao: e ferramenta de operacao. A aplicacao fala
com o banco pelo ORM, sempre.
"""
import json
import urllib.error
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


class Neon:
    def __init__(self, env_path=None):
        from decouple import Config, RepositoryEnv

        env = Config(RepositoryEnv(str(env_path or BASE_DIR / '.env')))

        self.host = env('NEON_DB_HOST')
        self.dbname = env('NEON_DB_NAME')
        usuario = env('NEON_DB_USER')
        senha = env('NEON_DB_PASSWORD')
        self.conn_str = (
            f'postgresql://{usuario}:{senha}@{self.host}/{self.dbname}?sslmode=require'
        )

    def executar(self, sql, params=None):
        requisicao = urllib.request.Request(
            f'https://{self.host}/sql',
            data=json.dumps({'query': sql, 'params': params or []}).encode(),
            headers={
                'Content-Type': 'application/json',
                'Neon-Connection-String': self.conn_str,
                'Neon-Raw-Text-Output': 'true',
                'Neon-Array-Mode': 'true',
            },
        )

        try:
            with urllib.request.urlopen(requisicao, timeout=120) as resposta:
                return json.loads(resposta.read().decode())
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f'Neon recusou o SQL: {exc.read().decode()}') from None

    def linhas(self, sql, params=None):
        return self.executar(sql, params).get('rows', [])
