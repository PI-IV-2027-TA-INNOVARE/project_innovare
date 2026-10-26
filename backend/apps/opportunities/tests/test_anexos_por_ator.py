"""
Quem envia e quem ve cada anexo, como a baseline preve.

PB21: o Demandante Externo e o Supervisor anexam; o Pesquisador da equipe
acompanha a oportunidade (PB49) e le os documentos, mas nao anexa.

PB71: o Demandante acompanha o andamento "sem acessar informacoes internas
restritas". O que a AC2 anexa e trabalho interno: a empresa ve os documentos
que ela mesma enviou, e o historico dela nao mostra o nome do arquivo interno
nem o e-mail de quem agiu pela AC2.

Nada toca banco remoto (AGENTS.md 0.1).
"""
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.decisions.models import Decisao, TipoDecisao
from apps.matching.models import EquipePotencial, MembroEquipe
from apps.network.models import PapelNaRede
from apps.opportunities.services import anexos_visiveis
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
)

MEDIA_TEMP = tempfile.mkdtemp(prefix='pdconnect-anexos-ator-')
PDF = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n'


@override_settings(MEDIA_ROOT=MEDIA_TEMP)
class AnexosPorAtorTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_TEMP, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.vale_verde = OrganizacaoBuilder().demandante().chamada('Vale Verde').build()
        self.demandante = (
            UsuarioBuilder().demandante().chamado('Joana Prado').na_organizacao(self.vale_verde).build()
        )
        self.colega = UsuarioBuilder().demandante().na_organizacao(self.vale_verde).build()
        self.supervisor = (
            UsuarioBuilder().supervisor().com_email('rafael@ac2microbiologia.com.br').build()
        )
        self.pesquisador = UsuarioBuilder().pesquisador().build()

        self.oportunidade = (
            OportunidadeBuilder().externa(self.vale_verde).criada_por(self.demandante).build()
        )
        MembroEquipe.objects.create(
            equipe=EquipePotencial.objects.create(oportunidade=self.oportunidade),
            membro=MembroRedeBuilder().pesquisador().com_acesso(self.pesquisador).build(),
            papel=PapelNaRede.PESQUISADOR,
        )

        self.da_empresa = self.enviar(self.demandante, 'laudo-do-lote.pdf')
        self.da_ac2 = self.enviar(self.supervisor, 'parecer-interno.pdf')

    def url(self):
        return reverse('oportunidade-anexos', args=[self.oportunidade.codigo])

    def enviar(self, usuario, nome, esperado=status.HTTP_201_CREATED):
        self.client.force_authenticate(usuario)
        resposta = self.client.post(
            self.url(),
            {'arquivo': SimpleUploadedFile(nome, PDF, content_type='application/pdf')},
            format='multipart',
        )
        self.assertEqual(resposta.status_code, esperado, resposta.data)
        return resposta.data.get('id_anexo')

    def nomes(self, usuario):
        self.client.force_authenticate(usuario)
        return sorted(anexo['nome_original'] for anexo in self.client.get(self.url()).data)

    def baixar(self, usuario, id_anexo):
        self.client.force_authenticate(usuario)
        return self.client.get(
            reverse('oportunidade-anexo-download', args=[self.oportunidade.codigo, id_anexo])
        )

    def historico(self, usuario):
        self.client.force_authenticate(usuario)
        return self.client.get(
            reverse('oportunidade-historico', args=[self.oportunidade.codigo])
        ).data

    def test_pesquisador_da_equipe_le_os_anexos_mas_nao_anexa(self):
        self.assertEqual(self.nomes(self.pesquisador), ['laudo-do-lote.pdf', 'parecer-interno.pdf'])

        self.enviar(self.pesquisador, 'tentativa.pdf', esperado=status.HTTP_403_FORBIDDEN)
        self.assertEqual(len(self.nomes(self.supervisor)), 2)

    def test_supervisor_ve_tudo(self):
        self.assertEqual(self.nomes(self.supervisor), ['laudo-do-lote.pdf', 'parecer-interno.pdf'])

    def test_demandante_ve_so_o_que_a_empresa_enviou(self):
        self.assertEqual(self.nomes(self.demandante), ['laudo-do-lote.pdf'])
        self.assertEqual(self.nomes(self.colega), ['laudo-do-lote.pdf'])

    def test_demandante_nao_baixa_o_anexo_da_ac2(self):
        self.assertEqual(self.baixar(self.demandante, self.da_ac2).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.baixar(self.demandante, self.da_empresa).status_code, status.HTTP_200_OK)

    def test_contagem_do_demandante_so_conta_o_que_ele_ve(self):
        self.client.force_authenticate(self.demandante)
        detalhe = self.client.get(reverse('oportunidade-detail', args=[self.oportunidade.codigo]))
        lista = self.client.get(reverse('oportunidade-list'))

        self.assertEqual(detalhe.data['total_anexos'], 1)
        self.assertEqual(lista.data['results'][0]['total_anexos'], 1)

        self.client.force_authenticate(self.supervisor)
        self.assertEqual(
            self.client.get(reverse('oportunidade-list')).data['results'][0]['total_anexos'], 2
        )

    def test_historico_do_demandante_nao_mostra_o_anexo_interno(self):
        enviados = [
            evento['detalhe'].get('nome')
            for evento in self.historico(self.demandante)
            if evento['tipo'] == 'anexo_enviado'
        ]

        self.assertEqual(enviados, ['laudo-do-lote.pdf'])

    def test_historico_do_demandante_mostra_a_ac2_sem_e_mail_de_quem_agiu(self):
        registrar_evento(
            categoria=CategoriaEvento.OPORTUNIDADE,
            tipo='contexto_atualizado',
            entidade='oportunidade',
            entidade_id=self.oportunidade.codigo,
            oportunidade=self.oportunidade,
            ator=self.supervisor.email,
            detalhe={'campos': ['contexto']},
        )

        evento = next(
            item for item in self.historico(self.demandante) if item['tipo'] == 'contexto_atualizado'
        )
        proprio = next(
            item for item in self.historico(self.demandante) if item['tipo'] == 'anexo_enviado'
        )

        self.assertEqual(evento['ator'], '')
        self.assertEqual(evento['ator_nome'], 'Núcleo de P&D da AC2')
        self.assertEqual(proprio['ator_nome'], 'Joana Prado')

    def test_supervisor_com_a_organizacao_da_empresa_continua_sendo_a_ac2(self):
        """
        A organizacao da conta pode estar errada num ator interno. O que conta
        e o papel: so o que um Demandante da empresa enviou e dela.
        """
        engano = (
            UsuarioBuilder().supervisor().com_email('engano@ac2microbiologia.com.br')
            .na_organizacao(self.vale_verde).build()
        )
        self.enviar(engano, 'nota-interna.pdf')

        self.assertEqual(self.nomes(self.demandante), ['laudo-do-lote.pdf'])
        atores = {item['ator'] for item in self.historico(self.demandante)}
        self.assertNotIn('engano@ac2microbiologia.com.br', atores)

    def test_demandante_sem_empresa_nao_ve_anexo_nenhum(self):
        sem_empresa = UsuarioBuilder().demandante().build()

        self.assertFalse(anexos_visiveis(self.oportunidade, sem_empresa).exists())

    def test_demandante_nao_recebe_o_nome_de_quem_decide_nem_do_responsavel(self):
        self.oportunidade.responsavel = (
            MembroRedeBuilder().supervisor().com_acesso(self.supervisor).build()
        )
        self.oportunidade.save(update_fields=['responsavel'])
        Decisao.objects.create(
            oportunidade=self.oportunidade,
            tipo_decisao=TipoDecisao.CONTINUAR,
            observacoes='Maturidade suficiente.',
            responsavel=self.supervisor,
        )
        url = reverse('oportunidade-detail', args=[self.oportunidade.codigo])

        self.client.force_authenticate(self.demandante)
        do_demandante = self.client.get(url).data
        self.client.force_authenticate(self.supervisor)
        do_supervisor = self.client.get(url).data

        self.assertEqual(do_demandante['ultima_decisao']['autor_nome'], 'Núcleo de P&D da AC2')
        self.assertIsNone(do_demandante['responsavel'])
        self.assertIsNone(do_demandante['responsavel_nome'])
        self.assertEqual(do_supervisor['ultima_decisao']['autor_nome'], self.supervisor.nome)
        self.assertIsNotNone(do_supervisor['responsavel'])

    def test_supervisor_ve_quem_agiu_no_historico(self):
        nomes = {item['ator'] for item in self.historico(self.supervisor) if item['tipo'] == 'anexo_enviado'}

        self.assertIn('rafael@ac2microbiologia.com.br', nomes)
