"""
A implantacao na VPS: o compose de producao e o nginx da frente.

Nenhum dos dois roda na suite. Este teste le os arquivos e trava o que e
seguranca: so o nginx fica exposto, o endereco de origem vem dele e nao do
cliente, o Redis nao sai da rede interna e a tela sai com os cabecalhos que a
politica de conteudo do `index.html` nao cobre.
"""
import re
import runpy
from pathlib import Path

import yaml
from django.conf import settings
from django.test import SimpleTestCase

from core.middleware import ENVELOPE_DO_ANEXO_BYTES

BACKEND = Path(settings.BASE_DIR)
IMPLANTACAO = BACKEND.parent / 'deploy'
TEMPLATES = IMPLANTACAO / 'nginx' / 'templates'

SERVICOS_QUE_FICAM_NO_AR = ('backend', 'worker', 'beat', 'redis', 'nginx', 'certbot')
SERVICOS_DA_IMAGEM_DO_BACKEND = ('backend', 'worker', 'beat', 'estaticos')
ENV_DO_BACKEND = '../backend/.env:/app/backend/.env:ro'


def compose():
    with open(IMPLANTACAO / 'compose.producao.yml', encoding='utf-8') as arquivo:
        return yaml.safe_load(arquivo)


def nginx(nome):
    return (TEMPLATES / nome).read_text(encoding='utf-8')


def megas(valor):
    return int(re.fullmatch(r'(\d+)m', valor).group(1)) * 1024 * 1024


def segundos(valor):
    return int(re.fullmatch(r'(\d+)s', valor).group(1))


def bloco(site, caminho):
    """O `location` do site em HTTPS; o de HTTP so redireciona."""
    https = site[site.index('http2 on;'):]
    achado = re.search(r'location ' + re.escape(caminho) + r' \{(.*?)\n    \}', https, re.S)

    return achado.group(1) if achado else None


class ComposeDeProducaoTests(SimpleTestCase):
    def setUp(self):
        self.servicos = compose()['services']

    def test_so_o_nginx_fica_exposto(self):
        expostos = {nome for nome, servico in self.servicos.items() if servico.get('ports')}

        self.assertEqual(expostos, {'nginx'})
        self.assertEqual(
            {porta.split(':')[-1] for porta in self.servicos['nginx']['ports']},
            {'80', '443'},
        )

    def test_o_redis_nao_sai_da_rede_interna_e_pede_senha(self):
        redes = compose()['networks']

        self.assertEqual(self.servicos['redis']['networks'], ['interna'])
        self.assertTrue(redes['interna']['internal'])
        self.assertIn('--requirepass', self.servicos['redis']['command'])

    def test_a_api_sobe_em_producao_atras_de_um_proxy(self):
        ambiente = self.servicos['backend']['environment']

        self.assertEqual(ambiente['AMBIENTE'], 'producao')
        self.assertEqual(ambiente['DEBUG'], 'False')
        self.assertEqual(ambiente['NUM_PROXIES'], '1')
        self.assertTrue(ambiente['CACHE_URL'].startswith('redis://'))
        self.assertTrue(ambiente['CELERY_BROKER_URL'].startswith('redis://'))
        self.assertNotEqual(ambiente['CACHE_URL'][-2:], ambiente['CELERY_BROKER_URL'][-2:])

    def test_os_servicos_do_backend_leem_o_mesmo_ambiente(self):
        for nome in SERVICOS_DA_IMAGEM_DO_BACKEND:
            with self.subTest(servico=nome):
                self.assertEqual(
                    self.servicos[nome]['environment'], self.servicos['backend']['environment']
                )

    def test_o_env_do_backend_entra_so_para_leitura(self):
        for nome in SERVICOS_DA_IMAGEM_DO_BACKEND:
            with self.subTest(servico=nome):
                self.assertIn(ENV_DO_BACKEND, self.servicos[nome]['volumes'])

    def test_os_anexos_sobrevivem_a_atualizacao_da_imagem(self):
        """A retencao roda no worker e apaga anexo vencido: ele ve a mesma pasta."""
        for nome in ('backend', 'worker'):
            with self.subTest(servico=nome):
                self.assertIn('media:/app/backend/media', self.servicos[nome]['volumes'])

        self.assertIn('media', compose()['volumes'])

    def test_os_estaticos_do_admin_chegam_ao_nginx(self):
        self.assertIn('estaticos:/app/backend/staticfiles', self.servicos['estaticos']['volumes'])
        self.assertIn('estaticos:/srv/static:ro', self.servicos['nginx']['volumes'])
        self.assertEqual(
            self.servicos['nginx']['depends_on']['estaticos']['condition'],
            'service_completed_successfully',
        )

    def test_todo_servico_volta_sozinho_e_o_log_tem_teto(self):
        for nome in SERVICOS_QUE_FICAM_NO_AR:
            with self.subTest(servico=nome):
                servico = self.servicos[nome]

                self.assertEqual(servico['restart'], 'unless-stopped')
                self.assertTrue(servico['logging']['options']['max-size'])

    def test_a_pasta_dos_estaticos_e_do_usuario_da_imagem(self):
        """Volume novo copia a pasta da imagem; sem ela, nasce do root e o collectstatic falha."""
        dockerfile = (BACKEND / 'Dockerfile').read_text(encoding='utf-8')

        self.assertIn('/app/backend/staticfiles', dockerfile)


class NginxDaFrenteTests(SimpleTestCase):
    def setUp(self):
        self.site = nginx('default.conf.template')
        self.para_a_api = nginx('para-a-api.inc.template')
        self.cabecalhos = nginx('cabecalhos.inc.template')

    def test_o_endereco_de_origem_vem_do_nginx_e_nao_do_cliente(self):
        self.assertIn('proxy_set_header X-Forwarded-For $remote_addr;', self.para_a_api)
        self.assertNotIn('$proxy_add_x_forwarded_for', self.para_a_api)
        self.assertIn('proxy_set_header X-Forwarded-Proto $scheme;', self.para_a_api)
        self.assertIn('proxy_set_header Host $host;', self.para_a_api)

    def test_o_nginx_aceita_o_maior_anexo_que_a_api_aceita(self):
        teto = re.search(r'client_max_body_size (\S+);', self.site).group(1)
        anexo = settings.ANEXO_TAMANHO_MAXIMO_MB * 1024 * 1024 + ENVELOPE_DO_ANEXO_BYTES

        self.assertGreaterEqual(megas(teto), anexo)

    def test_o_nginx_espera_a_ia_mais_que_o_gunicorn(self):
        gunicorn = runpy.run_path(str(BACKEND / 'gunicorn.conf.py'))
        espera = re.search(r'proxy_read_timeout (\S+);', self.para_a_api).group(1)

        self.assertGreater(segundos(espera), gunicorn['timeout'])

    def test_a_api_e_o_admin_do_django_vao_para_o_gunicorn(self):
        for caminho in ('/api/', '/${ADMIN_URL}/'):
            with self.subTest(caminho=caminho):
                self.assertIn('para-a-api.inc', bloco(self.site, caminho) or '')

    def test_endereco_desconhecido_e_recusado(self):
        self.assertIn('return 444;', self.site)
        self.assertIn('ssl_reject_handshake on;', self.site)

    def test_http_vira_https_e_deixa_passar_o_desafio_do_certificado(self):
        self.assertIn('location /.well-known/acme-challenge/', self.site)
        self.assertIn('return 301 https://$host$request_uri;', self.site)

    def test_a_tela_sai_com_os_cabecalhos_de_seguranca(self):
        for cabecalho in (
            'Strict-Transport-Security',
            'X-Frame-Options "DENY"',
            "frame-ancestors 'none'",
            'X-Content-Type-Options "nosniff"',
            'Referrer-Policy "same-origin"',
            'Permissions-Policy',
        ):
            with self.subTest(cabecalho=cabecalho):
                self.assertIn(cabecalho, self.cabecalhos)

    def test_toda_rota_da_tela_leva_os_cabecalhos(self):
        """`add_header` num bloco apaga os de cima: cada bloco da tela inclui os seus."""
        for caminho in ('/', '/assets/', '/fonts/', '/static/'):
            with self.subTest(caminho=caminho):
                self.assertIn('cabecalhos.inc', bloco(self.site, caminho) or '')

    def test_a_tela_cai_no_index_html(self):
        self.assertIn('try_files $uri /index.html;', self.site)

    def test_o_nginx_nao_diz_a_versao(self):
        self.assertIn('server_tokens off;', self.site)
