"""
Retencao de dados pessoais (LGPD, SPEC-17).

Os registros de acesso vencem em 12 meses e sao anonimizados; os anexos vencem
em 24 meses depois do arquivamento da oportunidade e sao descartados. A
simulacao nao altera nada. Nada toca banco remoto, SMTP ou fila real
(AGENTS.md 0.1).
"""
import os
import shutil
import tempfile
from datetime import timedelta
from io import StringIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.services.titular import PESSOA_REMOVIDA
from apps.audit.models import CategoriaEvento, EventoAuditoria
from apps.audit.services import registrar_evento
from apps.audit.services.registro import ATOR_SISTEMA
from apps.audit.services.retencao import AplicarRetencaoService, meses_atras
from apps.audit.tasks import aplicar_retencao as tarefa_aplicar_retencao
from apps.decisions.models import Decisao, TipoDecisao
from apps.opportunities.models import AnexoOportunidade
from core.tests.builders import OportunidadeBuilder, UsuarioBuilder

MEDIA_TEMP = tempfile.mkdtemp(prefix='pdconnect-retencao-')
PDF = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n'


@override_settings(MEDIA_ROOT=MEDIA_TEMP)
class RetencaoTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_TEMP, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.agora = timezone.now()
        self.pessoa = (
            UsuarioBuilder()
            .supervisor()
            .chamado('Rafael Antunes')
            .com_email('rafael@ac2.example')
            .build()
        )
        self.vencido = self.evento('login', self.agora - timedelta(days=400))
        self.recente = self.evento('login', self.agora - timedelta(days=100))

        self.oportunidade = (
            OportunidadeBuilder().interna().criada_por(self.pessoa).build()
        )
        self.arquivar(self.oportunidade, self.agora - timedelta(days=800))
        self.anexo_vencido = self.anexo(self.oportunidade, 'laudo-antigo.pdf')

    def evento(self, tipo, quando):
        return registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo=tipo,
            entidade='usuario',
            entidade_id=self.pessoa.pk,
            ator=self.pessoa.email,
            ocorrido_em=quando,
        )

    def arquivar(self, oportunidade, quando):
        decisao = Decisao.objects.create(
            oportunidade=oportunidade,
            tipo_decisao=TipoDecisao.ARQUIVAR,
            observacoes='Arquivada.',
            responsavel=self.pessoa,
        )
        Decisao.objects.filter(pk=decisao.pk).update(registrada_em=quando)
        return decisao

    def anexo(self, oportunidade, nome):
        return AnexoOportunidade.objects.create(
            oportunidade=oportunidade,
            arquivo=SimpleUploadedFile(nome, PDF, content_type='application/pdf'),
            nome_original=nome,
            mime='application/pdf',
            tamanho_bytes=len(PDF),
            enviado_por=self.pessoa,
        )

    def test_simulacao_lista_sem_alterar_nem_auditar(self):
        caminho = self.anexo_vencido.arquivo.path

        resultado = AplicarRetencaoService().execute(agora=self.agora)

        self.assertTrue(resultado.simulado)
        self.assertEqual(
            [evento.id_evento for evento in resultado.eventos], [self.vencido.pk]
        )
        self.assertEqual(
            [anexo.id_anexo for anexo in resultado.anexos],
            [self.anexo_vencido.pk],
        )

        self.vencido.refresh_from_db()
        self.assertEqual(self.vencido.ator, self.pessoa.email)
        self.assertIsNotNone(self.vencido.conta_do_ator)
        self.assertTrue(
            AnexoOportunidade.objects.filter(pk=self.anexo_vencido.pk).exists()
        )
        self.assertTrue(os.path.exists(caminho))
        self.assertFalse(
            EventoAuditoria.objects.filter(tipo='retencao_aplicada').exists()
        )

    def test_aplicacao_anonimiza_evento_e_descarta_anexo(self):
        caminho = self.anexo_vencido.arquivo.path
        ocorrido_em = self.vencido.ocorrido_em

        with self.captureOnCommitCallbacks(execute=True):
            resultado = AplicarRetencaoService().execute(
                agora=self.agora, aplicar=True
            )

        self.assertFalse(resultado.simulado)

        self.vencido.refresh_from_db()
        self.assertEqual(self.vencido.ator, PESSOA_REMOVIDA)
        self.assertIsNone(self.vencido.conta_do_ator)
        self.assertEqual(self.vencido.tipo, 'login')
        self.assertEqual(self.vencido.ocorrido_em, ocorrido_em)

        self.recente.refresh_from_db()
        self.assertEqual(self.recente.ator, self.pessoa.email)
        self.assertIsNotNone(self.recente.conta_do_ator)

        self.assertFalse(
            AnexoOportunidade.objects.filter(pk=self.anexo_vencido.pk).exists()
        )
        self.assertFalse(os.path.exists(caminho))

        auditoria = EventoAuditoria.objects.get(tipo='retencao_aplicada')
        self.assertEqual(auditoria.categoria, CategoriaEvento.CONFIG)
        self.assertEqual(auditoria.ator, ATOR_SISTEMA)
        self.assertEqual(auditoria.entidade, 'retencao')
        self.assertEqual(auditoria.entidade_id, 'lgpd')
        self.assertEqual(auditoria.detalhe['eventos_anonimizados'], 1)
        self.assertEqual(auditoria.detalhe['anexos_descartados'], 1)
        self.assertEqual(auditoria.detalhe['retencao_eventos_meses'], 12)
        self.assertEqual(auditoria.detalhe['retencao_anexos_meses'], 24)

    def test_anonimiza_entrada_recusada_e_saida(self):
        recusado = self.evento(
            'login_recusado', self.agora - timedelta(days=400)
        )
        saida = self.evento('logout', self.agora - timedelta(days=400))

        resultado = AplicarRetencaoService().execute(agora=self.agora)

        self.assertEqual(
            {evento.id_evento for evento in resultado.eventos},
            {self.vencido.pk, recusado.pk, saida.pk},
        )

    def test_evento_de_oportunidade_antigo_fica(self):
        antigo = registrar_evento(
            categoria=CategoriaEvento.OPORTUNIDADE,
            tipo='oportunidade_cadastrada',
            entidade='oportunidade',
            entidade_id=self.oportunidade.codigo,
            ator=self.pessoa.email,
            ocorrido_em=self.agora - timedelta(days=800),
            oportunidade=self.oportunidade,
        )

        resultado = AplicarRetencaoService().execute(agora=self.agora)

        self.assertNotIn(
            antigo.pk, [evento.id_evento for evento in resultado.eventos]
        )

    def test_anexo_de_oportunidade_nao_arquivada_fica(self):
        outra = OportunidadeBuilder().interna().build()
        anexo = self.anexo(outra, 'rascunho.pdf')

        resultado = AplicarRetencaoService().execute(agora=self.agora)

        self.assertNotIn(
            anexo.pk, [item.id_anexo for item in resultado.anexos]
        )

    def test_anexo_arquivado_ha_menos_de_24_meses_fica(self):
        outra = OportunidadeBuilder().interna().build()
        self.arquivar(outra, self.agora - timedelta(days=100))
        anexo = self.anexo(outra, 'recente.pdf')

        resultado = AplicarRetencaoService().execute(agora=self.agora)

        self.assertNotIn(
            anexo.pk, [item.id_anexo for item in resultado.anexos]
        )

    def test_task_aplica_e_devolve_as_contagens(self):
        with self.captureOnCommitCallbacks(execute=True):
            contagens = tarefa_aplicar_retencao()

        self.assertEqual(
            contagens,
            {'eventos_anonimizados': 1, 'anexos_descartados': 1},
        )
        self.vencido.refresh_from_db()
        self.assertEqual(self.vencido.ator, PESSOA_REMOVIDA)

    def test_comando_simula_por_padrao_e_avisa(self):
        saida = StringIO()

        call_command('aplicar_retencao', stdout=saida)

        texto = saida.getvalue()
        self.assertIn('Simulação', texto)
        self.assertIn(f'evento {self.vencido.pk}', texto)
        self.assertIn(f'anexo {self.anexo_vencido.pk}', texto)
        self.assertIn('--aplicar', texto)

        self.vencido.refresh_from_db()
        self.assertEqual(self.vencido.ator, self.pessoa.email)

    def test_comando_aplicar_executa(self):
        saida = StringIO()

        with self.captureOnCommitCallbacks(execute=True):
            call_command('aplicar_retencao', '--aplicar', stdout=saida)

        self.assertIn('Retenção aplicada', saida.getvalue())
        self.vencido.refresh_from_db()
        self.assertEqual(self.vencido.ator, PESSOA_REMOVIDA)

    def test_meses_atras_respeita_o_fim_do_mes(self):
        referencia = self.agora.replace(
            year=2026,
            month=3,
            day=31,
            hour=12,
            minute=0,
            second=0,
            microsecond=0,
        )

        self.assertEqual(
            meses_atras(referencia, 1),
            referencia.replace(month=2, day=28),
        )
