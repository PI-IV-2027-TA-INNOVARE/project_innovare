"""
Fumaca do `/admin/`: toda pagina abre e o corte de escrita se sustenta.

O admin e ferramenta de operacao e suporte, nao a tela do ator Administrador.
Cadastro de apoio se edita por la; registro de fluxo so se le; a trilha de
auditoria nao se apaga de jeito nenhum (RF12).

Nada aqui toca banco remoto, SMTP real ou provedor de IA (AGENTS.md 0.1).
"""
from django.contrib import admin
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from apps.audit.models import CategoriaEvento, EventoAuditoria
from apps.organizations.models import Organizacao, TipoOrganizacao
from core.admin import SomenteLeituraMixin
from core.tests.builders import OrganizacaoBuilder, UsuarioBuilder


def rota_admin(modelo, acao, args=None):
    meta = modelo._meta
    return reverse(f'admin:{meta.app_label}_{meta.model_name}_{acao}', args=args)


class AdminBaseTests(TestCase):
    def setUp(self):
        self.operador = (
            UsuarioBuilder().operador_do_django().chamado('Suporte da plataforma').build()
        )
        self.client.force_login(self.operador)


class AdminCoberturaTests(AdminBaseTests):
    def test_todo_modelo_de_dominio_esta_registrado(self):
        from django.apps import apps as registro_de_apps
        from django.conf import settings

        locais = [app.split('.')[-1] for app in settings.LOCAL_APPS]
        registrados = set(admin.site._registry)

        ausentes = [
            f'{cfg.label}.{modelo.__name__}'
            for cfg in registro_de_apps.get_app_configs()
            if cfg.label in locais
            for modelo in cfg.get_models()
            if modelo not in registrados
        ]

        self.assertEqual(ausentes, [])

    def test_toda_listagem_registrada_abre(self):
        for modelo in admin.site._registry:
            with self.subTest(modelo=modelo.__name__):
                resposta = self.client.get(rota_admin(modelo, 'changelist'))
                self.assertEqual(resposta.status_code, 200)

    def test_o_indice_lista_os_apps_de_dominio(self):
        resposta = self.client.get(reverse('admin:index'))

        self.assertEqual(resposta.status_code, 200)
        self.assertContains(resposta, 'oportunidade')


class AdminCadastroDeApoioTests(AdminBaseTests):
    def test_organizacao_pode_ser_criada_pelo_admin(self):
        resposta = self.client.post(
            rota_admin(Organizacao, 'add'),
            {'tipo': TipoOrganizacao.INSTITUICAO, 'nome': 'Instituto Parceiro', 'ativo': 'on'},
        )

        self.assertEqual(resposta.status_code, 302)
        self.assertTrue(Organizacao.objects.filter(nome='Instituto Parceiro').exists())

    def test_organizacao_pode_ser_excluida_pelo_admin(self):
        organizacao = OrganizacaoBuilder().chamada('Instituto Efemero').build()

        resposta = self.client.post(
            rota_admin(Organizacao, 'delete', args=[organizacao.pk]), {'post': 'yes'}
        )

        self.assertEqual(resposta.status_code, 302)
        self.assertFalse(Organizacao.objects.filter(pk=organizacao.pk).exists())


class AdminRegistroDeFluxoTests(AdminBaseTests):
    def somente_leitura(self):
        return [
            (modelo, opcoes)
            for modelo, opcoes in admin.site._registry.items()
            if isinstance(opcoes, SomenteLeituraMixin)
        ]

    def test_registro_de_fluxo_nega_escrita(self):
        pedido = self.client.get(reverse('admin:index')).wsgi_request

        for modelo, opcoes in self.somente_leitura():
            with self.subTest(modelo=modelo.__name__):
                self.assertFalse(opcoes.has_add_permission(pedido))
                self.assertFalse(opcoes.has_change_permission(pedido))
                self.assertFalse(opcoes.has_delete_permission(pedido))
                self.assertTrue(opcoes.has_view_permission(pedido))

    def test_registro_de_fluxo_recusa_a_tela_de_criacao(self):
        for modelo, _ in self.somente_leitura():
            with self.subTest(modelo=modelo.__name__):
                resposta = self.client.get(rota_admin(modelo, 'add'))
                self.assertEqual(resposta.status_code, 403)


class AdminTrilhaDeAuditoriaTests(AdminBaseTests):
    def setUp(self):
        super().setUp()
        self.evento = EventoAuditoria.objects.create(
            ocorrido_em=timezone.now(),
            categoria=CategoriaEvento.CONTA,
            tipo='conta.criada',
            ator=self.operador.email,
            entidade='usuario',
            entidade_id=str(self.operador.pk),
        )

    def test_evento_e_visivel(self):
        resposta = self.client.get(
            rota_admin(EventoAuditoria, 'change', args=[self.evento.pk])
        )

        self.assertEqual(resposta.status_code, 200)

    def test_evento_nao_pode_ser_editado(self):
        resposta = self.client.post(
            rota_admin(EventoAuditoria, 'change', args=[self.evento.pk]),
            {'tipo': 'conta.adulterada'},
        )

        self.assertEqual(resposta.status_code, 403)
        self.evento.refresh_from_db()
        self.assertEqual(self.evento.tipo, 'conta.criada')

    def test_evento_nao_pode_ser_apagado(self):
        resposta = self.client.post(
            rota_admin(EventoAuditoria, 'delete', args=[self.evento.pk]), {'post': 'yes'}
        )

        self.assertEqual(resposta.status_code, 403)
        self.assertTrue(EventoAuditoria.objects.filter(pk=self.evento.pk).exists())


class AdminPortaoDeAcessoTests(TestCase):
    def test_conta_sem_acesso_ao_django_nao_entra(self):
        supervisor = UsuarioBuilder().supervisor().chamado('Rafael Antunes').build()
        self.client.force_login(supervisor)

        resposta = self.client.get(reverse('admin:index'))

        self.assertEqual(resposta.status_code, 302)
        self.assertIn('/admin/login/', resposta['Location'])
