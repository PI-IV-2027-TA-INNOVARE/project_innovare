"""
Testes da Oportunidade: escopo por ator, cadastro, decisao, complementacao,
anexos e historico.

Nenhum toca banco remoto, SMTP real, provedor de IA ou disco de producao
(AGENTS.md 0.1) - `MEDIA_ROOT` vai para um diretorio temporario.
"""
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Papel, Usuario
from apps.audit.models import EventoAuditoria
from apps.audit.services import registrar_evento
from apps.decisions.models import Decisao, TipoDecisao
from apps.matching.models import EquipePotencial
from apps.network.models import MembroRede, PapelNaRede, SituacaoMembro
from apps.notifications.models import Notificacao
from apps.opportunities.models import Oportunidade, SituacaoOportunidade
from apps.organizations.models import Organizacao, TipoOrganizacao

SENHA = 'Bioinsumo!2026'
MEDIA_TEMP = tempfile.mkdtemp(prefix='pdconnect-testes-')


@override_settings(MEDIA_ROOT=MEDIA_TEMP)
class OportunidadeBaseTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_TEMP, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()

        self.vale_verde = Organizacao.objects.create(
            tipo=TipoOrganizacao.DEMANDANTE,
            nome='Agroindustria Vale Verde',
            cnpj='12345678000199',
        )
        self.terra_boa = Organizacao.objects.create(
            tipo=TipoOrganizacao.DEMANDANTE,
            nome='Cooperativa Terra Boa',
            cnpj='98765432000155',
        )

        self.supervisor = Usuario.objects.create_user(
            email='supervisor@ac2microbiologia.com.br',
            nome='Rafael Antunes', papel=Papel.SUPERVISOR, password=SENHA,
        )
        self.demandante = Usuario.objects.create_user(
            email='demandante@valeverde.com.br',
            nome='Agroindustria Vale Verde', papel=Papel.DEMANDANTE,
            organizacao=self.vale_verde, password=SENHA,
        )
        self.outro_demandante = Usuario.objects.create_user(
            email='demandante@terraboa.com.br',
            nome='Cooperativa Terra Boa', papel=Papel.DEMANDANTE,
            organizacao=self.terra_boa, password=SENHA,
        )
        self.pesquisador = Usuario.objects.create_user(
            email='pesquisador@ac2microbiologia.com.br',
            nome='Maria Ferreira', papel=Papel.PESQUISADOR, password=SENHA,
        )
        self.administrador = Usuario.objects.create_user(
            email='admin@ac2microbiologia.com.br',
            nome='Administracao', papel=Papel.ADMINISTRADOR, password=SENHA,
        )

        self.membro_supervisor = MembroRede.objects.create(
            usuario=self.supervisor, nome='Rafael Antunes',
            email=self.supervisor.email, papel_rede=PapelNaRede.SUPERVISOR,
            situacao=SituacaoMembro.ATIVO,
        )
        self.membro_pesquisador = MembroRede.objects.create(
            usuario=self.pesquisador, nome='Maria Ferreira',
            email=self.pesquisador.email, papel_rede=PapelNaRede.PESQUISADOR,
            situacao=SituacaoMembro.ATIVO,
        )

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def criar_externo(self, **extra):
        self.como(self.demandante)
        corpo = {'titulo': 'Contaminacao na linha de envase',
                 'resumo': 'Perdas por contaminacao microbiana.'}
        corpo.update(extra)
        return self.client.post(reverse('oportunidade-list'), corpo, format='json')


class CadastroTests(OportunidadeBaseTests):
    def test_demandante_abre_problema_externo_vinculado_a_sua_organizacao(self):
        resposta = self.criar_externo()

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resposta.data['origem'], 'externo')
        self.assertEqual(resposta.data['demandante_nome'], 'Agroindustria Vale Verde')
        self.assertEqual(resposta.data['situacao'], SituacaoOportunidade.ENTRADA)
        self.assertRegex(resposta.data['codigo'], r'^OP-\d{4}-\d{3}$')

    def test_supervisor_abre_ideia_interna_sem_demandante(self):
        self.como(self.supervisor)
        resposta = self.client.post(
            reverse('oportunidade-list'),
            {'titulo': 'Cultura starter regional', 'resumo': 'Isolar cultura nativa.'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resposta.data['origem'], 'interna')
        self.assertIsNone(resposta.data['demandante'])

    def test_origem_vem_do_ator_e_nao_do_corpo(self):
        resposta = self.criar_externo(origem='interna')
        self.assertEqual(resposta.data['origem'], 'externo')

    def test_pesquisador_e_administrador_nao_cadastram(self):
        for usuario in (self.pesquisador, self.administrador):
            self.como(usuario)
            resposta = self.client.post(
                reverse('oportunidade-list'), {'titulo': 'x', 'resumo': 'y'},
                format='json',
            )
            self.assertIn(
                resposta.status_code,
                (status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST),
            )

    def test_cadastro_deixa_evento_na_trilha(self):
        codigo = self.criar_externo().data['codigo']

        self.assertTrue(
            EventoAuditoria.objects.filter(
                entidade='oportunidade', entidade_id=codigo,
                tipo='oportunidade_cadastrada',
            ).exists()
        )

    def test_codigos_sao_sequenciais_e_nao_repetem(self):
        codigos = {self.criar_externo().data['codigo'] for _ in range(3)}
        self.assertEqual(len(codigos), 3)


class EscopoDeLeituraTests(OportunidadeBaseTests):
    def setUp(self):
        super().setUp()
        self.codigo_vale = self.criar_externo().data['codigo']

        self.como(self.outro_demandante)
        self.codigo_terra = self.client.post(
            reverse('oportunidade-list'),
            {'titulo': 'Nitrito em embutidos', 'resumo': 'Cultura protetora.'},
            format='json',
        ).data['codigo']

        self.como(self.supervisor)
        self.codigo_interna = self.client.post(
            reverse('oportunidade-list'),
            {'titulo': 'Biofilme em trocador', 'resumo': 'Ideia interna.'},
            format='json',
        ).data['codigo']

    def test_supervisor_ve_a_fila_inteira(self):
        self.como(self.supervisor)
        resposta = self.client.get(reverse('oportunidade-list'))
        self.assertEqual(resposta.data['count'], 3)

    def test_demandante_ve_so_os_proprios_problemas(self):
        self.como(self.demandante)
        resposta = self.client.get(reverse('oportunidade-list'))

        self.assertEqual(resposta.data['count'], 1)
        self.assertEqual(resposta.data['results'][0]['codigo'], self.codigo_vale)

    def test_codigo_de_outra_organizacao_devolve_404_e_nao_403(self):
        self.como(self.demandante)
        resposta = self.client.get(
            reverse('oportunidade-detail', args=[self.codigo_terra])
        )
        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)

    def test_pesquisador_so_ve_onde_integra_a_equipe_potencial(self):
        self.como(self.pesquisador)
        self.assertEqual(
            self.client.get(reverse('oportunidade-list')).data['count'], 0
        )

        EquipePotencial.objects.create(
            oportunidade=Oportunidade.objects.get(codigo=self.codigo_vale),
            membro=self.membro_pesquisador,
        )

        resposta = self.client.get(reverse('oportunidade-list'))
        self.assertEqual(resposta.data['count'], 1)
        self.assertEqual(resposta.data['results'][0]['codigo'], self.codigo_vale)

    def test_administrador_nao_acompanha_oportunidade(self):
        self.como(self.administrador)
        resposta = self.client.get(reverse('oportunidade-list'))
        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_filtro_por_situacao_e_origem(self):
        self.como(self.supervisor)

        por_origem = self.client.get(
            reverse('oportunidade-list'), {'origem': 'interna'}
        )
        self.assertEqual(por_origem.data['count'], 1)
        self.assertEqual(por_origem.data['results'][0]['codigo'], self.codigo_interna)


class DecisaoTests(OportunidadeBaseTests):
    def setUp(self):
        super().setUp()
        self.codigo = self.criar_externo().data['codigo']
        self.oportunidade = Oportunidade.objects.get(codigo=self.codigo)
        self.oportunidade.responsavel = self.membro_supervisor
        self.oportunidade.save(update_fields=['responsavel'])

    def url(self):
        return reverse('oportunidade-decisao', args=[self.codigo])

    def decidir(self, tipo, justificativa='Maturidade suficiente para avancar.'):
        self.como(self.supervisor)
        return self.client.post(
            self.url(), {'tipo': tipo, 'justificativa': justificativa}, format='json'
        )

    def test_continuar_registra_decisao_e_muda_a_situacao(self):
        resposta = self.decidir(TipoDecisao.CONTINUAR)

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['situacao'], SituacaoOportunidade.CONTINUAR)
        self.assertEqual(Decisao.objects.count(), 1)

    def test_justificativa_e_obrigatoria(self):
        resposta = self.decidir(TipoDecisao.ARQUIVAR, justificativa='curto')

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Decisao.objects.count(), 0)

    def test_so_o_supervisor_decide(self):
        for usuario in (self.demandante, self.pesquisador, self.administrador):
            self.como(usuario)
            resposta = self.client.post(
                self.url(),
                {'tipo': TipoDecisao.CONTINUAR, 'justificativa': 'tentando decidir'},
                format='json',
            )
            self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_revisar_notifica_o_demandante(self):
        self.decidir(
            TipoDecisao.REVISAR,
            justificativa='Faltam os laudos microbiologicos dos lotes afetados.',
        )

        notificacao = Notificacao.objects.get(usuario=self.demandante)
        self.assertEqual(
            notificacao.tipo, 'oportunidade.complementacao_solicitada'
        )
        self.assertIn(self.codigo, notificacao.titulo)
        self.assertEqual(Notificacao.objects.filter(usuario=self.outro_demandante).count(), 0)

    def test_continuar_nao_notifica_ninguem(self):
        self.decidir(TipoDecisao.CONTINUAR)
        self.assertEqual(Notificacao.objects.count(), 0)

    def test_arquivada_nao_recebe_nova_decisao(self):
        self.decidir(TipoDecisao.ARQUIVAR, justificativa='Escopo ja coberto por outro projeto.')
        resposta = self.decidir(TipoDecisao.CONTINUAR)

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'ja_arquivada')


class ComplementacaoTests(OportunidadeBaseTests):
    def setUp(self):
        super().setUp()
        self.codigo = self.criar_externo().data['codigo']
        self.oportunidade = Oportunidade.objects.get(codigo=self.codigo)
        self.oportunidade.responsavel = self.membro_supervisor
        self.oportunidade.save(update_fields=['responsavel'])

    def url(self):
        return reverse('oportunidade-complementar', args=[self.codigo])

    def pedir_revisao(self):
        self.como(self.supervisor)
        self.client.post(
            reverse('oportunidade-decisao', args=[self.codigo]),
            {'tipo': TipoDecisao.REVISAR, 'justificativa': 'Faltam os laudos.'},
            format='json',
        )

    def test_demandante_responde_e_o_texto_entra_no_contexto(self):
        self.pedir_revisao()
        self.como(self.demandante)

        resposta = self.client.post(
            self.url(), {'texto': 'Laudos anexados na proxima semana.'}, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertIn('Laudos anexados', resposta.data['contexto'])

    def test_complementar_sem_pedido_aberto_e_conflito(self):
        self.como(self.demandante)
        resposta = self.client.post(
            self.url(), {'texto': 'Mandando sem ninguem pedir.'}, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'sem_pedido_aberto')

    def test_complementacao_avisa_o_supervisor_responsavel(self):
        self.pedir_revisao()
        self.como(self.demandante)
        self.client.post(self.url(), {'texto': 'Segue o que foi pedido.'}, format='json')

        self.assertTrue(
            Notificacao.objects.filter(
                usuario=self.supervisor,
                tipo='oportunidade.complementacao_recebida',
            ).exists()
        )

    def test_supervisor_nao_responde_a_propria_solicitacao(self):
        self.pedir_revisao()
        self.como(self.supervisor)

        resposta = self.client.post(self.url(), {'texto': 'respondendo sozinho'}, format='json')
        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)


class AnexoTests(OportunidadeBaseTests):
    def setUp(self):
        super().setUp()
        self.codigo = self.criar_externo().data['codigo']

    def url(self):
        return reverse('oportunidade-anexos', args=[self.codigo])

    def pdf(self, nome='laudo.pdf', tamanho=32):
        return SimpleUploadedFile(nome, b'%PDF-1.4' + b'x' * tamanho, content_type='application/pdf')

    def test_demandante_anexa_e_o_arquivo_fica_vinculado(self):
        self.como(self.demandante)
        resposta = self.client.post(self.url(), {'arquivo': self.pdf()}, format='multipart')

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resposta.data['nome_original'], 'laudo.pdf')
        self.assertEqual(resposta.data['mime'], 'application/pdf')

        listagem = self.client.get(self.url())
        self.assertEqual(len(listagem.data), 1)

    def test_supervisor_consulta_o_anexo_do_demandante(self):
        self.como(self.demandante)
        self.client.post(self.url(), {'arquivo': self.pdf()}, format='multipart')

        self.como(self.supervisor)
        listagem = self.client.get(self.url())
        self.assertEqual(len(listagem.data), 1)

    def test_outra_organizacao_nao_alcanca_os_anexos(self):
        self.como(self.demandante)
        self.client.post(self.url(), {'arquivo': self.pdf()}, format='multipart')

        self.como(self.outro_demandante)
        self.assertEqual(
            self.client.get(self.url()).status_code, status.HTTP_404_NOT_FOUND
        )

    def test_tipo_fora_da_lista_e_recusado(self):
        self.como(self.demandante)
        executavel = SimpleUploadedFile(
            'script.exe', b'MZ', content_type='application/x-msdownload'
        )
        resposta = self.client.post(self.url(), {'arquivo': executavel}, format='multipart')

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resposta.data['codigo'], 'anexo_tipo_recusado')

    @override_settings(ANEXO_TAMANHO_MAXIMO_MB=0)
    def test_arquivo_acima_do_limite_e_recusado(self):
        self.como(self.demandante)
        resposta = self.client.post(self.url(), {'arquivo': self.pdf()}, format='multipart')

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resposta.data['codigo'], 'anexo_grande_demais')

    def test_anexo_deixa_evento_na_trilha(self):
        self.como(self.demandante)
        self.client.post(self.url(), {'arquivo': self.pdf()}, format='multipart')

        self.assertTrue(
            EventoAuditoria.objects.filter(
                entidade_id=self.codigo, tipo='anexo_enviado'
            ).exists()
        )


class HistoricoTests(OportunidadeBaseTests):
    def setUp(self):
        super().setUp()
        self.codigo = self.criar_externo().data['codigo']

        self.como(self.supervisor)
        self.client.patch(
            reverse('oportunidade-detail', args=[self.codigo]),
            {'contexto': 'Ocorre no lote de verao.'},
            format='json',
        )
        self.client.post(
            reverse('oportunidade-decisao', args=[self.codigo]),
            {'tipo': TipoDecisao.CONTINUAR, 'justificativa': 'Maturidade suficiente.'},
            format='json',
        )

    def url(self):
        return reverse('oportunidade-historico', args=[self.codigo])

    def test_supervisor_ve_a_trilha_completa(self):
        self.como(self.supervisor)
        resposta = self.client.get(self.url())

        tipos = {evento['tipo'] for evento in resposta.data}
        self.assertIn('oportunidade_cadastrada', tipos)
        self.assertIn('contexto_atualizado', tipos)
        self.assertIn('decisao_continuar', tipos)

    def test_edicao_de_contexto_registra_quais_campos_mudaram(self):
        self.como(self.supervisor)
        evento = next(
            e for e in self.client.get(self.url()).data
            if e['tipo'] == 'contexto_atualizado'
        )
        self.assertEqual(evento['detalhe']['campos'], ['contexto'])

    def test_demandante_nao_ve_categoria_interna(self):
        registrar_evento(
            categoria='matching', tipo='matching_executado',
            entidade='oportunidade', entidade_id=self.codigo,
        )

        self.como(self.demandante)
        categorias = {e['categoria'] for e in self.client.get(self.url()).data}

        self.assertIn('oportunidade', categorias)
        self.assertNotIn('matching', categorias)
