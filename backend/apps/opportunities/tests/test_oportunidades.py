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
from apps.matching.models import EquipePotencial, MembroEquipe
from apps.network.models import MembroRede, PapelNaRede, SituacaoMembro
from apps.notifications.models import Notificacao
from apps.opportunities.models import Oportunidade, SituacaoOportunidade
from apps.opportunities.services import historico_de
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

        MembroEquipe.objects.create(
            equipe=EquipePotencial.objects.create(
                oportunidade=Oportunidade.objects.get(codigo=self.codigo_vale)
            ),
            membro=self.membro_pesquisador,
            papel=PapelNaRede.PESQUISADOR,
        )

        resposta = self.client.get(reverse('oportunidade-list'))
        self.assertEqual(resposta.data['count'], 1)
        self.assertEqual(resposta.data['results'][0]['codigo'], self.codigo_vale)

    def test_pesquisador_retirado_da_equipe_perde_o_acompanhamento(self):
        """
        RN-A06: quem o Supervisor tira da composicao deixa de acompanhar.

        `incluido` existe para essa retirada. Enquanto o escopo de leitura nao
        olhar para ele, a coluna registra uma decisao que o sistema ignora.
        """
        indicacao = MembroEquipe.objects.create(
            equipe=EquipePotencial.objects.create(
                oportunidade=Oportunidade.objects.get(codigo=self.codigo_vale)
            ),
            membro=self.membro_pesquisador,
            papel=PapelNaRede.PESQUISADOR,
        )

        self.como(self.pesquisador)
        self.assertEqual(
            self.client.get(reverse('oportunidade-list')).data['count'], 1
        )

        indicacao.incluido = False
        indicacao.save(update_fields=['incluido'])

        self.assertEqual(
            self.client.get(reverse('oportunidade-list')).data['count'], 0
        )
        self.assertEqual(
            self.client.get(
                reverse('oportunidade-detail', args=[self.codigo_vale])
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_uma_geracao_sem_o_pesquisador_nao_apaga_a_que_o_tem(self):
        """
        Cada execucao de matching cria uma `EquipePotencial` nova.

        Estar de fora da geracao mais recente nao e o mesmo que ter sido
        retirado: quem retira e o Supervisor, por `incluido`.
        """
        oportunidade = Oportunidade.objects.get(codigo=self.codigo_vale)

        MembroEquipe.objects.create(
            equipe=EquipePotencial.objects.create(oportunidade=oportunidade),
            membro=self.membro_pesquisador,
            papel=PapelNaRede.PESQUISADOR,
        )
        EquipePotencial.objects.create(oportunidade=oportunidade)

        self.como(self.pesquisador)
        self.assertEqual(
            self.client.get(reverse('oportunidade-list')).data['count'], 1
        )

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

    def test_complementacao_nao_cria_caixa_para_o_supervisor(self):
        """
        A caixa de notificacoes e do Demandante Externo (PB26). O Supervisor
        acompanha a resposta na propria oportunidade e na aba Historico - a PB27
        promete visibilidade na tela da oportunidade, nao um aviso. O que fica
        registrado de "quem respondeu o que" e a trilha de auditoria, que e
        append-only e nao depende de ninguem abrir um sino.
        """
        self.pedir_revisao()
        self.como(self.demandante)
        self.client.post(self.url(), {'texto': 'Segue o que foi pedido.'}, format='json')

        self.assertEqual(Notificacao.objects.filter(usuario=self.supervisor).count(), 0)
        self.assertTrue(
            EventoAuditoria.objects.filter(
                entidade='oportunidade',
                entidade_id=self.codigo,
                tipo='complementacao_enviada',
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

    def test_o_recorte_do_demandante_mora_no_service(self):
        """
        PB71 e regra de negocio, e regra nao mora na view (AGENTS.md 1): quem
        decide o que cada ator le da trilha e `historico_de`.
        """
        registrar_evento(
            categoria='matching', tipo='matching_executado',
            entidade='oportunidade', entidade_id=self.codigo,
        )
        oportunidade = Oportunidade.objects.get(codigo=self.codigo)

        do_demandante = historico_de(oportunidade, self.demandante)
        do_supervisor = historico_de(oportunidade, self.supervisor)

        self.assertNotIn('matching', {e.categoria for e in do_demandante})
        self.assertIn('matching', {e.categoria for e in do_supervisor})

    def test_a_trilha_vem_da_mais_recente_para_a_mais_antiga(self):
        oportunidade = Oportunidade.objects.get(codigo=self.codigo)
        momentos = [e.ocorrido_em for e in historico_de(oportunidade, self.supervisor)]

        self.assertEqual(momentos, sorted(momentos, reverse=True))


class UltimaDecisaoNaLeituraTests(OportunidadeBaseTests):
    """
    A tela de acompanhamento le o desfecho pelo proprio registro.

    PB26 exige que o Demandante leia o pedido de revisao; PB71 mantem fora do
    alcance dele o raciocinio interno de *Continuar* e *Arquivar*.
    """

    def setUp(self):
        super().setUp()
        self.codigo = self.criar_externo().data['codigo']

    def decidir(self, tipo, justificativa):
        self.como(self.supervisor)
        return self.client.post(
            reverse('oportunidade-decisao', args=[self.codigo]),
            {'tipo': tipo, 'justificativa': justificativa},
            format='json',
        )

    def ler_como(self, usuario):
        self.como(usuario)
        return self.client.get(reverse('oportunidade-detail', args=[self.codigo]))

    def test_sem_decisao_a_leitura_traz_nulo(self):
        self.assertIsNone(self.ler_como(self.supervisor).data['ultima_decisao'])

    def test_supervisor_le_a_justificativa_de_qualquer_desfecho(self):
        self.decidir(TipoDecisao.CONTINUAR, 'Maturidade suficiente para avancar.')

        decisao = self.ler_como(self.supervisor).data['ultima_decisao']

        self.assertEqual(decisao['tipo'], 'continuar')
        self.assertEqual(decisao['tipo_rotulo'], 'Continuar')
        self.assertEqual(decisao['justificativa'], 'Maturidade suficiente para avancar.')
        self.assertEqual(decisao['autor_nome'], 'Rafael Antunes')

    def test_demandante_le_a_justificativa_quando_o_pedido_e_para_ele(self):
        pedido = 'Faltam os laudos microbiologicos dos lotes afetados.'
        self.decidir(TipoDecisao.REVISAR, pedido)

        decisao = self.ler_como(self.demandante).data['ultima_decisao']

        self.assertEqual(decisao['tipo'], 'revisar')
        self.assertEqual(decisao['justificativa'], pedido)

    def test_demandante_nao_le_o_raciocinio_interno_de_arquivar(self):
        self.decidir(TipoDecisao.ARQUIVAR, 'Escopo ja coberto por projeto em curso.')

        decisao = self.ler_como(self.demandante).data['ultima_decisao']

        self.assertEqual(decisao['tipo'], 'arquivar')
        self.assertEqual(decisao['justificativa'], '')


class ObservacaoTests(OportunidadeBaseTests):
    """
    PB65 - observacao registrada durante a avaliacao.

    Nao e decisao: a Decisao fecha o fluxo e exige desfecho, a observacao so
    documenta o raciocinio enquanto ele acontece.
    """

    def setUp(self):
        super().setUp()
        self.codigo = self.criar_externo().data['codigo']

    def url(self):
        return reverse('oportunidade-observacoes', args=[self.codigo])

    def registrar(self, texto='Laudo do lote de verao confirma a contaminacao.'):
        return self.client.post(self.url(), {'texto': texto}, format='json')

    def test_supervisor_registra_observacao_e_ela_entra_na_trilha(self):
        self.como(self.supervisor)
        resposta = self.registrar()

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)

        evento = EventoAuditoria.objects.get(
            entidade_id=self.codigo, tipo='observacao_registrada'
        )
        self.assertEqual(
            evento.detalhe['texto'],
            'Laudo do lote de verao confirma a contaminacao.',
        )
        self.assertEqual(evento.ator, self.supervisor.email)

    def test_observacao_aparece_no_historico_com_o_texto(self):
        self.como(self.supervisor)
        self.registrar()

        evento = next(
            e for e in self.client.get(
                reverse('oportunidade-historico', args=[self.codigo])
            ).data
            if e['tipo'] == 'observacao_registrada'
        )
        self.assertEqual(evento['categoria'], 'observacao')
        self.assertIn('contaminacao', evento['detalhe']['texto'])

    def test_so_o_supervisor_registra_observacao(self):
        for usuario in (self.demandante, self.pesquisador, self.administrador):
            with self.subTest(papel=usuario.papel):
                self.como(usuario)
                self.assertEqual(
                    self.registrar().status_code, status.HTTP_403_FORBIDDEN
                )

    def test_texto_curto_demais_e_recusado(self):
        self.como(self.supervisor)
        self.assertEqual(
            self.registrar(texto='ok').status_code, status.HTTP_400_BAD_REQUEST
        )

    def test_observacao_nao_muda_a_situacao_da_oportunidade(self):
        self.como(self.supervisor)
        antes = Oportunidade.objects.get(codigo=self.codigo).situacao
        self.registrar()

        self.assertEqual(
            Oportunidade.objects.get(codigo=self.codigo).situacao, antes
        )
        self.assertFalse(Decisao.objects.filter(
            oportunidade__codigo=self.codigo).exists())

    def test_demandante_nao_ve_a_observacao_interna(self):
        self.como(self.supervisor)
        self.registrar()

        self.como(self.demandante)
        tipos = {
            e['tipo'] for e in self.client.get(
                reverse('oportunidade-historico', args=[self.codigo])
            ).data
        }
        self.assertNotIn('observacao_registrada', tipos)


class SolicitacaoDeComplementoTests(OportunidadeBaseTests):
    """
    PB26: o Supervisor pede informacao ao Demandante sem decidir nada.

    A PB64 ja devolvia a oportunidade com "Revisar", e o pedido saia de carona
    nessa decisao. Mas decidir e registrar um desfecho (RN-A07) e mover a
    situacao; perguntar nao e nenhum dos dois. Colapsar os dois obrigava o
    Supervisor a encerrar a avaliacao para tirar uma duvida, e enchia a trilha
    de decisoes que nao decidiram.

    O pedido aberto vive na **trilha**, nao em coluna nova: a trilha e
    append-only e ja e a fonte do historico, e `RegistrarObservacaoService` abriu
    esse precedente. Assim a PB26 entra sem migration - e portao de decisao
    (AGENTS.md 3.2) que este item nao precisa atravessar.
    """

    def setUp(self):
        super().setUp()
        self.codigo = self.criar_externo().data['codigo']
        self.oportunidade = Oportunidade.objects.get(codigo=self.codigo)
        self.oportunidade.responsavel = self.membro_supervisor
        self.oportunidade.save(update_fields=['responsavel'])

    def url(self):
        return reverse('oportunidade-solicitar-complemento', args=[self.codigo])

    def solicitar(self, mensagem='Faltam os laudos microbiologicos do lote.'):
        return self.client.post(self.url(), {'mensagem': mensagem}, format='json')

    def test_supervisor_solicita_e_a_situacao_nao_se_move(self):
        self.como(self.supervisor)
        situacao_antes = self.oportunidade.situacao

        resposta = self.solicitar()

        self.oportunidade.refresh_from_db()
        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.oportunidade.situacao, situacao_antes)

    def test_solicitar_nao_registra_decisao(self):
        self.como(self.supervisor)

        self.solicitar()

        self.assertFalse(
            Decisao.objects.filter(oportunidade=self.oportunidade).exists()
        )

    def test_o_pedido_notifica_o_demandante_com_o_que_falta(self):
        self.como(self.supervisor)

        self.solicitar('Faltam os laudos microbiologicos do lote.')

        aviso = Notificacao.objects.get(usuario=self.demandante)
        self.assertEqual(aviso.tipo, 'oportunidade.complementacao_solicitada')
        self.assertIn('laudos microbiologicos', aviso.mensagem)

    def test_o_pedido_fica_na_trilha(self):
        self.como(self.supervisor)

        self.solicitar()

        self.assertTrue(
            EventoAuditoria.objects.filter(
                entidade='oportunidade',
                entidade_id=self.codigo,
                tipo='complemento_solicitado',
            ).exists()
        )

    def test_demandante_responde_ao_pedido_sem_passar_por_revisar(self):
        self.como(self.supervisor)
        self.solicitar()

        self.como(self.demandante)
        resposta = self.client.post(
            reverse('oportunidade-complementar', args=[self.codigo]),
            {'texto': 'Laudos emitidos em 12/09.'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertIn('Laudos emitidos', resposta.data['contexto'])

    def test_respondido_o_pedido_fecha_e_nao_aceita_segunda_resposta(self):
        self.como(self.supervisor)
        self.solicitar()

        self.como(self.demandante)
        complementar = reverse('oportunidade-complementar', args=[self.codigo])
        self.client.post(complementar, {'texto': 'Primeira resposta.'}, format='json')

        segunda = self.client.post(
            complementar, {'texto': 'Segunda sem ninguem pedir.'}, format='json'
        )

        self.assertEqual(segunda.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(segunda.data['codigo'], 'sem_pedido_aberto')

    def test_mensagem_vazia_e_recusada(self):
        self.como(self.supervisor)

        resposta = self.client.post(self.url(), {'mensagem': '   '}, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Notificacao.objects.filter(usuario=self.demandante).exists())

    def test_ideia_interna_nao_tem_a_quem_pedir(self):
        self.como(self.supervisor)
        interna = self.client.post(
            reverse('oportunidade-list'),
            {'titulo': 'Ensaio de bioinsumo', 'resumo': 'Ideia do Nucleo.'},
            format='json',
        ).data['codigo']

        resposta = self.client.post(
            reverse('oportunidade-solicitar-complemento', args=[interna]),
            {'mensagem': 'Faltam dados.'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'sem_demandante')

    def test_demandante_nao_solicita_a_si_mesmo(self):
        self.como(self.demandante)

        self.assertEqual(self.solicitar().status_code, status.HTTP_403_FORBIDDEN)

    def test_pesquisador_nao_solicita(self):
        self.como(self.pesquisador)

        self.assertEqual(self.solicitar().status_code, status.HTTP_403_FORBIDDEN)

    def test_anonimo_nao_solicita(self):
        self.como(None)

        self.assertEqual(self.solicitar().status_code, status.HTTP_401_UNAUTHORIZED)
