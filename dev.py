#!/usr/bin/env python
"""
Sobe o backend (Django) e o frontend (Vite) juntos, num terminal só.

    python dev.py                 # sobe os dois
    python dev.py --so-backend    # só a API
    python dev.py --so-frontend   # só o front
    python dev.py --checar        # só o diagnóstico, não sobe nada

Ctrl+C derruba os dois. Cada linha de saída vem marcada com a origem, para que
um traceback do Django e um erro do Vite não se confundam no scroll.

POR QUE UM SCRIPT E NAO `concurrently`
--------------------------------------
`concurrently` resolveria isto em uma linha de `package.json`, mas seria uma
dependencia nova - portao de decisao do AGENTS.md 3.2. Este arquivo usa apenas
a biblioteca padrao do Python, que o projeto ja exige de qualquer forma.

Nao substitui rodar cada um no seu terminal: quando voce estiver depurando um
dos lados a serio, dois terminais continuam melhores, porque voce reinicia um
sem derrubar o outro.
"""
import argparse
import os
import platform
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
BACKEND = RAIZ / 'backend'
FRONTEND = RAIZ / 'frontend'

WINDOWS = platform.system() == 'Windows'

COLORIR = sys.stdout.isatty() and os.environ.get('NO_COLOR') is None
AZUL, CIANO, VERMELHO, AMARELO, VERDE, CINZA, ZERA = (
    ('\033[34m', '\033[36m', '\033[31m', '\033[33m', '\033[32m', '\033[90m', '\033[0m')
    if COLORIR else ('',) * 7
)


def pinta(cor, texto):
    return f'{cor}{texto}{ZERA}' if COLORIR else texto


def stdout_em_utf8():
    """
    Repassar a saída do Vite exige UTF-8.

    O Vite imprime setas (`➜`) e o Django imprime acentos. No Windows, quando a
    saída é redirecionada para arquivo ou pipe, o Python assume cp1252 e um
    `print` desses caracteres levanta `UnicodeEncodeError` — que mata a thread
    de repasse e faz o serviço parecer morto quando ele está de pé.
    """
    for fluxo in (sys.stdout, sys.stderr):
        if hasattr(fluxo, 'reconfigure'):
            fluxo.reconfigure(encoding='utf-8', errors='replace')


def venv_do_backend():
    """Caminho do Python do venv do backend, ou None se não houver venv."""
    candidatos = [
        BACKEND / 'venv' / 'Scripts' / 'python.exe',
        BACKEND / 'venv' / 'bin' / 'python',
        BACKEND / '.venv' / 'Scripts' / 'python.exe',
        BACKEND / '.venv' / 'bin' / 'python',
    ]

    for candidato in candidatos:
        if candidato.exists():
            return candidato

    return None


def python_do_backend():
    """O Python do venv do backend, se existir; senão o que está rodando isto."""
    venv = venv_do_backend()

    return str(venv) if venv else sys.executable


def npm():
    """No Windows o npm é um `.cmd`; `shutil.which` resolve isso."""
    caminho = shutil.which('npm')
    if caminho is None:
        raise SystemExit(
            pinta(VERMELHO, 'npm nao encontrado no PATH. Instale o Node.js.')
        )
    return caminho


def porta_ocupada(porta):
    import socket

    with socket.socket() as s:
        s.settimeout(1)
        return s.connect_ex(('127.0.0.1', int(porta))) == 0


def checar_portas(portas):
    """
    Recusa subir sobre um processo que já está no ar.

    O servidor de desenvolvimento do Django liga `allow_reuse_address`, e no
    Windows isso deixa **dois** processos escutando a mesma porta. As requisições
    se dividem entre eles de forma imprevisível, e você acaba depurando um
    servidor que não é o que está respondendo — um log que não aparece, um
    `print` que some, um reload que não faz efeito. Falhar aqui, com o PID na
    tela, custa dez segundos; descobrir isso sozinho custa uma tarde.
    """
    problemas = []

    for nome, porta in portas:
        if porta_ocupada(porta):
            problemas.append(
                f'a porta {porta} ({nome}) ja esta em uso. '
                f'Veja quem: netstat -ano | findstr :{porta}  '
                f'e encerre: taskkill /F /T /PID <pid>'
            )

    for problema in problemas:
        print(pinta(VERMELHO, f'  erro : {problema}'))

    return not problemas


def checar(quer_backend, quer_frontend):
    """
    Confere o que costuma faltar antes de subir.

    Falhar aqui, com a causa nomeada, é melhor do que dois processos morrendo
    em paralelo com tracebacks entrelaçados.
    """
    problemas = []
    avisos = []

    if quer_backend:
        if not (BACKEND / 'manage.py').exists():
            problemas.append(f'{BACKEND} nao parece um projeto Django (sem manage.py).')

        if not (BACKEND / '.env').exists():
            problemas.append(
                'backend/.env nao existe. Copie de backend/.env.example e preencha.'
            )

        py = python_do_backend()
        if venv_do_backend() is None:
            avisos.append(
                'Sem venv em backend/venv - usando o Python atual. '
                'Se der ImportError, crie o venv e instale requirements.txt.'
            )

        try:
            subprocess.run(
                [py, '-c', 'import django, rest_framework'],
                check=True, capture_output=True, timeout=60,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
            problemas.append(
                'Django/DRF nao importam nesse Python. '
                'Rode: pip install -r backend/requirements.txt'
            )

    if quer_frontend:
        if not (FRONTEND / 'package.json').exists():
            problemas.append(f'{FRONTEND} nao parece um projeto Node (sem package.json).')

        if not (FRONTEND / 'node_modules').exists():
            problemas.append('frontend/node_modules nao existe. Rode: npm install')

        if not (FRONTEND / '.env').exists():
            avisos.append(
                'frontend/.env nao existe - o Vite vai usar os defaults do codigo. '
                'Copie de frontend/.env.example.'
            )

    for aviso in avisos:
        print(pinta(AMARELO, f'  aviso: {aviso}'))

    for problema in problemas:
        print(pinta(VERMELHO, f'  erro : {problema}'))

    return not problemas


def alerta_de_banco():
    """
    Um lembrete barato, não um teste de conexão.

    Conectar de verdade custaria segundos e travaria a subida quando a rede
    estivesse ruim - justamente a hora em que você mais quer o servidor de pé
    para ver o erro real.
    """
    env = BACKEND / '.env'
    if not env.exists():
        return

    for linha in env.read_text(encoding='utf-8', errors='replace').splitlines():
        limpa = linha.strip()
        if limpa.startswith('DB_HOST=') and 'neon.tech' in limpa:
            print(pinta(AMARELO,
                '  aviso: DB_HOST aponta para o Neon. Se a sua rede bloquear a '
                'porta 5432, a API sobe mas toda query da timeout.'))
            print(pinta(CINZA,
                '         Ver backend/README.md, secao "Banco".'))
            return


class Servico:
    def __init__(self, nome, cor, comando, cwd):
        self.nome = nome
        self.cor = cor
        self.comando = comando
        self.cwd = cwd
        self.processo = None
        self.thread = None

    def subir(self):
        extras = {}
        if WINDOWS:
            extras['creationflags'] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            extras['start_new_session'] = True

        ambiente = {**os.environ, 'PYTHONUNBUFFERED': '1'}

        self.processo = subprocess.Popen(
            self.comando,
            cwd=str(self.cwd),
            env=ambiente,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace',
            bufsize=1,
            **extras,
        )

        self.thread = threading.Thread(target=self._repassar, daemon=True)
        self.thread.start()
        return self

    def _repassar(self):
        etiqueta = pinta(self.cor, f'[{self.nome}]')
        for linha in self.processo.stdout:
            print(f'{etiqueta} {linha.rstrip()}', flush=True)

    def derrubar(self):
        if self.processo is None or self.processo.poll() is not None:
            return

        if WINDOWS:
            subprocess.run(
                ['taskkill', '/F', '/T', '/PID', str(self.processo.pid)],
                capture_output=True,
            )
        else:
            os.killpg(os.getpgid(self.processo.pid), signal.SIGTERM)

        try:
            self.processo.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.processo.kill()


def main():
    parser = argparse.ArgumentParser(
        description='Sobe backend e frontend do P&D Connect juntos.'
    )
    parser.add_argument('--so-backend', action='store_true')
    parser.add_argument('--so-frontend', action='store_true')
    parser.add_argument('--checar', action='store_true',
                        help='só o diagnóstico, não sobe nada')
    parser.add_argument('--porta-backend', default='8000')
    args = parser.parse_args()

    stdout_em_utf8()

    quer_backend = not args.so_frontend
    quer_frontend = not args.so_backend

    print(pinta(VERDE, 'P&D Connect - ambiente de desenvolvimento'))
    print(pinta(CINZA, f'  raiz: {RAIZ}'))

    portas = []
    if quer_backend:
        portas.append(('backend', args.porta_backend))
    if quer_frontend:
        portas.append(('frontend', 5173))

    ambiente_ok = checar(quer_backend, quer_frontend)
    portas_ok = checar_portas(portas)

    if not (ambiente_ok and portas_ok):
        raise SystemExit(pinta(VERMELHO, '\nCorrija os erros acima e rode de novo.'))

    if quer_backend:
        alerta_de_banco()

    if args.checar:
        print(pinta(VERDE, '\nDiagnostico ok.'))
        return

    servicos = []

    if quer_backend:
        servicos.append(Servico(
            'backend', CIANO,
            [python_do_backend(), 'manage.py', 'runserver', args.porta_backend],
            BACKEND,
        ))

    if quer_frontend:
        servicos.append(Servico('frontend', AZUL, [npm(), 'run', 'dev'], FRONTEND))

    print()
    for servico in servicos:
        servico.subir()
        print(pinta(CINZA, f'  {servico.nome} iniciado (pid {servico.processo.pid})'))

    if quer_backend:
        print(pinta(CINZA, f'  API   : http://127.0.0.1:{args.porta_backend}/api/'))
        print(pinta(CINZA, f'  Swagger: http://127.0.0.1:{args.porta_backend}/api/docs/'))
    if quer_frontend:
        print(pinta(CINZA, '  Front : http://localhost:5173/'))

    print(pinta(CINZA, '\n  Ctrl+C derruba os dois.\n'))

    codigo = 0
    try:
        while True:
            for servico in servicos:
                saida = servico.processo.poll()
                if saida is not None:
                    print(pinta(
                        VERMELHO,
                        f'\n[{servico.nome}] encerrou com codigo {saida}. '
                        'Derrubando o resto.'
                    ))
                    codigo = saida or 1
                    raise KeyboardInterrupt
            time.sleep(0.4)
    except KeyboardInterrupt:
        print(pinta(CINZA, '\nEncerrando...'))
    finally:
        for servico in servicos:
            servico.derrubar()
        print(pinta(VERDE, 'Pronto.'))

    raise SystemExit(codigo)


if __name__ == '__main__':
    main()
