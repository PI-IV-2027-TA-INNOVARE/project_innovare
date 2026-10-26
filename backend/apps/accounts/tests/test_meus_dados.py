"""
Os direitos do titular (LGPD, art. 18): copia dos proprios dados e exclusao.

A pessoa baixa a copia e pede a exclusao pelo perfil. O Administrador atende
anonimizando a conta: nome, e-mail, telefone e perfil da rede somem, e a trilha
passa a dizer "pessoa removida" onde dizia o e-mail. Os fatos da trilha - o que
aconteceu, quando e em qual oportunidade - continuam.
"""
from datetime import date, timedelta
from unittest.mock import ANY

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import SituacaoConta, Usuario
from apps.accounts.services.titular import NOME_ANONIMO, PESSOA_REMOVIDA
from apps.ai.models import ExecucaoIA, TipoExecucaoIA
from apps.audit.models import CategoriaEvento, EventoAuditoria
from apps.audit.services import registrar_evento
from apps.copilot.models import Lacuna, PropostaEstruturada
from apps.matching.models import EquipePotencial, ExecucaoMatching, MembroEquipe
from apps.maturity.models import PreAnalise, PreAnaliseDimensao, Recomendacao, VersaoCriterio
from apps.network.models import Formacao, SituacaoMembro
from apps.notifications.models import Notificacao
from apps.opportunities.models import AnexoOportunidade
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
)


class MeusDadosTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.organizacao = OrganizacaoBuilder().demandante().build()
        self.pessoa = (
            UsuarioBuilder()
            .demandante()
            .chamado('Joana Prado')
            .com_email('joana@valeverde.example')
            .na_organizacao(self.organizacao)
            .build()
        )
        self.administrador = UsuarioBuilder().administrador().build()
        self.oportunidade = (
            OportunidadeBuilder().externa(self.organizacao).criada_por(self.pessoa).build()
        )

    def copia(self):
        self.client.force_authenticate(self.pessoa)
        return self.client.get(reverse('auth-meus-dados'))

    def test_a_copia_traz_a_conta_as_oportunidades_e_a_atividade(self):
        registrar_evento(
            categoria=CategoriaEvento.OPORTUNIDADE,
            tipo='oportunidade_cadastrada',
            entidade='oportunidade',
            entidade_id=self.oportunidade.codigo,
            ator=self.pessoa.email,
        )

        resposta = self.copia()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertIn('attachment', resposta['Content-Disposition'])
        self.assertEqual(resposta.data['conta']['email'], 'joana@valeverde.example')
        self.assertEqual(resposta.data['conta']['nome'], 'Joana Prado')
        self.assertEqual(
            [item['codigo'] for item in resposta.data['oportunidades_criadas']],
            [self.oportunidade.codigo],
        )
        self.assertEqual(
            resposta.data['atividade_registrada'][0]['acao'], 'Oportunidade cadastrada'
        )

    def test_a_copia_traz_o_perfil_da_rede_de_quem_tem(self):
        pesquisador = UsuarioBuilder().pesquisador().build()
        MembroRedeBuilder().pesquisador().com_acesso(pesquisador).com_experiencia(
            'Dez anos de bancada.'
        ).build()
        self.client.force_authenticate(pesquisador)

        dados = self.client.get(reverse('auth-meus-dados')).data

        self.assertEqual(dados['perfil_na_rede']['experiencia'], 'Dez anos de bancada.')

    def test_a_copia_traz_avisos_anexos_cnpj_e_o_que_outros_registraram(self):
        self.organizacao.cnpj = '11222333000181'
        self.organizacao.save(update_fields=['cnpj'])
        Notificacao.objects.create(
            usuario=self.pessoa, tipo='aviso', titulo='Pedido de complementacao', mensagem='Envie os laudos.'
        )
        AnexoOportunidade.objects.create(
            oportunidade=self.oportunidade,
            arquivo='anexos/laudo.pdf',
            nome_original='laudo.pdf',
            mime='application/pdf',
            tamanho_bytes=10,
            enviado_por=self.pessoa,
        )
        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='situacao_alterada',
            entidade='usuario',
            entidade_id=self.pessoa.pk,
            ator=self.administrador.email,
        )

        dados = self.copia().data

        self.assertEqual(dados['conta']['cnpj_da_organizacao'], '11222333000181')
        self.assertEqual(dados['avisos_recebidos'][0]['titulo'], 'Pedido de complementacao')
        self.assertEqual(
            dados['anexos_enviados'],
            [{'oportunidade': self.oportunidade.codigo, 'nome': 'laudo.pdf', 'enviado_em': ANY}],
        )
        self.assertEqual(len(dados['registros_sobre_voce']), 1)
        self.assertNotIn(self.administrador.email, str(dados['registros_sobre_voce']))

    def test_a_copia_traz_as_indicacoes_em_equipe_com_nota_e_motivos(self):
        pesquisador = UsuarioBuilder().pesquisador().build()
        membro = MembroRedeBuilder().pesquisador().com_acesso(pesquisador).build()
        equipe = EquipePotencial.objects.create(oportunidade=self.oportunidade)
        MembroEquipe.objects.create(
            equipe=equipe,
            membro=membro,
            papel='pesquisador',
            score_compatibilidade='0.8100',
            match_reasons=['Domina PCR.'],
        )
        self.client.force_authenticate(pesquisador)

        indicacoes = self.client.get(reverse('auth-meus-dados')).data['indicacoes_em_equipes']

        self.assertEqual(indicacoes[0]['oportunidade'], self.oportunidade.codigo)
        self.assertEqual(indicacoes[0]['nota'], '0.8100')
        self.assertEqual(indicacoes[0]['motivos'], ['Domina PCR.'])

    def test_a_copia_nao_traz_atividade_de_conta_anterior_com_o_mesmo_email(self):
        anterior = registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='senha_alterada',
            entidade='usuario',
            entidade_id=0,
            ator='reuso@valeverde.example',
        )
        EventoAuditoria.objects.filter(pk=anterior.pk).update(
            ocorrido_em=timezone.now() - timedelta(days=30)
        )
        nova = UsuarioBuilder().demandante().com_email('reuso@valeverde.example').build()
        self.client.force_authenticate(nova)

        dados = self.client.get(reverse('auth-meus-dados')).data

        self.assertEqual(dados['atividade_registrada'], [])

    def test_a_copia_acha_a_atividade_pela_conta_depois_de_o_email_mudar(self):
        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='senha_alterada',
            entidade='usuario',
            entidade_id=self.pessoa.pk,
            ator=self.pessoa.email,
        )
        Usuario.objects.filter(pk=self.pessoa.pk).update(email='joana.prado@valeverde.example')
        self.pessoa.refresh_from_db()

        dados = self.copia().data

        self.assertEqual(
            [item['acao'] for item in dados['atividade_registrada']], ['Senha alterada']
        )
        self.assertEqual(dados['registros_sobre_voce'], [])

    def test_a_copia_nao_fica_em_cache(self):
        self.assertEqual(self.copia()['Cache-Control'], 'no-store')

    def test_a_copia_e_so_de_quem_esta_logado(self):
        self.assertEqual(
            self.client.get(reverse('auth-meus-dados')).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_pedir_exclusao_fica_registrado_sem_aviso_com_o_nome(self):
        """
        A caixa de avisos e do Demandante Externo; o Administrador ve o pedido
        na lista de Usuarios, e o nome da pessoa nao vai para outra caixa.
        """
        self.client.force_authenticate(self.pessoa)

        resposta = self.client.post(reverse('auth-meus-dados-exclusao'))

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertIsNotNone(resposta.data['solicitada_em'])
        self.assertTrue(
            EventoAuditoria.objects.filter(
                tipo='exclusao_solicitada', entidade_id=str(self.pessoa.pk)
            ).exists()
        )
        self.assertFalse(Notificacao.objects.filter(usuario=self.administrador).exists())

        consulta = self.client.get(reverse('auth-meus-dados-exclusao'))
        self.assertIsNotNone(consulta.data['solicitada_em'])

    def test_pedido_repetido_nao_duplica(self):
        self.client.force_authenticate(self.pessoa)
        self.client.post(reverse('auth-meus-dados-exclusao'))

        resposta = self.client.post(reverse('auth-meus-dados-exclusao'))

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'exclusao_ja_solicitada')

    def test_o_administrador_ve_quem_pediu_exclusao(self):
        self.client.force_authenticate(self.pessoa)
        self.client.post(reverse('auth-meus-dados-exclusao'))
        self.client.force_authenticate(self.administrador)

        lista = self.client.get(reverse('usuario-list')).data
        linhas = lista['results'] if isinstance(lista, dict) else lista
        linha = next(item for item in linhas if item['id_usuario'] == self.pessoa.pk)

        self.assertIsNotNone(linha['exclusao_solicitada_em'])
        self.assertFalse(linha['anonimizada'])


class AnonimizacaoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.administrador = UsuarioBuilder().administrador().build()
        self.pessoa = (
            UsuarioBuilder()
            .pesquisador()
            .chamado('Joana Prado')
            .com_email('joana@ac2.example')
            .build()
        )
        self.membro = (
            MembroRedeBuilder().pesquisador().com_acesso(self.pessoa)
            .com_experiencia('Dez anos de bancada.').build()
        )
        Formacao.objects.create(membro=self.membro, curso='Biologia', instituicao='USP')
        self.evento = registrar_evento(
            categoria=CategoriaEvento.REDE,
            tipo='membro_atualizado',
            entidade='membro_rede',
            entidade_id=self.membro.pk,
            ator='joana@ac2.example',
            detalhe={'autor_nome': 'Joana Prado', 'campos': ['experiencia'], 'email': 'joana@ac2.example'},
        )
        self.refresh = RefreshToken.for_user(self.pessoa)
        self.client.force_authenticate(self.administrador)

    def anonimizar(self, usuario=None):
        return self.client.post(
            reverse('usuario-anonimizar', args=[(usuario or self.pessoa).pk])
        )

    def test_a_conta_perde_nome_email_senha_e_acesso(self):
        resposta = self.anonimizar()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.pessoa.refresh_from_db()
        self.assertEqual(self.pessoa.nome, NOME_ANONIMO)
        self.assertNotIn('joana', self.pessoa.email)
        self.assertFalse(self.pessoa.has_usable_password())
        self.assertEqual(self.pessoa.situacao, SituacaoConta.INATIVO)
        self.assertTrue(resposta.data['anonimizada'])

    def test_a_sessao_aberta_deixa_de_valer(self):
        self.anonimizar()

        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=self.refresh['jti']).exists()
        )

    def test_o_perfil_da_rede_sai_da_rede(self):
        self.anonimizar()

        self.membro.refresh_from_db()
        self.assertEqual(self.membro.experiencia, '')
        self.assertEqual(self.membro.situacao, SituacaoMembro.INATIVO)
        self.assertFalse(Formacao.objects.filter(membro=self.membro).exists())

    def test_a_trilha_diz_pessoa_removida_e_guarda_o_fato(self):
        self.anonimizar()

        self.evento.refresh_from_db()
        self.assertEqual(self.evento.ator, PESSOA_REMOVIDA)
        self.assertEqual(self.evento.detalhe['autor_nome'], PESSOA_REMOVIDA)
        self.assertEqual(self.evento.detalhe['email'], PESSOA_REMOVIDA)
        self.assertEqual(self.evento.detalhe['campos'], ['experiencia'])
        self.assertEqual(self.evento.tipo, 'membro_atualizado')

    def test_a_trilha_perde_a_ligacao_com_a_conta(self):
        self.anonimizar()

        self.evento.refresh_from_db()
        self.assertIsNone(self.evento.conta_do_ator)

    def test_o_evento_de_um_email_antigo_tambem_sai(self):
        Usuario.objects.filter(pk=self.pessoa.pk).update(email='joana.prado@ac2.example')

        self.anonimizar()

        self.evento.refresh_from_db()
        self.assertEqual(self.evento.ator, PESSOA_REMOVIDA)

    def test_o_evento_de_outra_conta_com_o_mesmo_email_fica(self):
        """Antes desta conta existir, o e-mail era de outra pessoa."""
        anterior = registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='senha_alterada',
            entidade='usuario',
            entidade_id=0,
            ator='joana@ac2.example',
        )
        EventoAuditoria.objects.filter(pk=anterior.pk).update(
            conta_do_ator=None, ocorrido_em=self.pessoa.criado_em - timedelta(days=30)
        )

        self.anonimizar()

        anterior.refresh_from_db()
        self.assertEqual(anterior.ator, 'joana@ac2.example')

    def test_so_troca_os_campos_que_guardam_pessoa(self):
        """
        Uma conta chamada como um papel nao apaga o papel dos eventos dos
        outros: o que aconteceu continua escrito.
        """
        homonima = UsuarioBuilder().supervisor().chamado('Supervisor').build()
        alheio = registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='conta_criada',
            entidade='usuario',
            entidade_id=self.administrador.pk,
            ator=self.administrador.email,
            detalhe={'papel': 'supervisor', 'nome': 'Supervisor'},
        )
        proprio = registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='conta_atualizada',
            entidade='usuario',
            entidade_id=homonima.pk,
            ator=self.administrador.email,
            detalhe={'papel': 'supervisor', 'nome': 'Supervisor'},
        )

        self.anonimizar(homonima)

        alheio.refresh_from_db()
        proprio.refresh_from_db()
        self.assertEqual(alheio.detalhe, {'papel': 'supervisor', 'nome': 'Supervisor'})
        self.assertEqual(proprio.detalhe, {'papel': 'supervisor', 'nome': PESSOA_REMOVIDA})

    def test_a_propria_anonimizacao_fica_na_trilha_sem_dado_da_pessoa(self):
        self.anonimizar()

        evento = EventoAuditoria.objects.get(tipo='conta_anonimizada')
        self.assertEqual(evento.ator, self.administrador.email)
        self.assertNotIn('joana', str(evento.detalhe).lower())

    def test_conta_ja_anonimizada_nao_e_anonimizada_de_novo(self):
        self.anonimizar()

        resposta = self.anonimizar()

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)

    def test_o_administrador_nao_anonimiza_a_propria_conta(self):
        resposta = self.anonimizar(self.administrador)

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_so_o_administrador_anonimiza(self):
        self.client.force_authenticate(UsuarioBuilder().supervisor().build())

        self.assertEqual(self.anonimizar().status_code, status.HTTP_403_FORBIDDEN)


class AnonimizacaoDoQueAIaGuardouTests(TestCase):
    """
    As execucoes guardam o e-mail de quem pediu, e a resposta da IA volta com
    o nome no lugar do apelido. Os dois saem na anonimizacao.
    """

    def setUp(self):
        self.client = APIClient()
        self.administrador = UsuarioBuilder().administrador().build()
        self.pessoa = (
            UsuarioBuilder()
            .supervisor()
            .chamado('Joana Prado')
            .com_email('joana@ac2.example')
            .build()
        )
        self.membro = MembroRedeBuilder().supervisor().com_acesso(self.pessoa).build()
        oportunidade = OportunidadeBuilder().interna().criada_por(self.pessoa).build()
        proposta = PropostaEstruturada.objects.create(
            oportunidade=oportunidade, problema_pesquisa='Contaminacao.'
        )

        self.execucao_ia = ExecucaoIA.objects.create(
            tipo=TipoExecucaoIA.MATCHING,
            provedor='fake',
            modelo='fake',
            executado_por='joana@ac2.example',
        )
        rodada = ExecucaoMatching.objects.create(
            oportunidade=oportunidade, estrategia='hibrida', executado_por='joana@ac2.example'
        )
        equipe = EquipePotencial.objects.create(oportunidade=oportunidade, execucao=rodada)
        self.indicacao = MembroEquipe.objects.create(
            equipe=equipe,
            membro=self.membro,
            papel='supervisor',
            justificativa='Joana Prado domina PCR.',
            match_reasons=['Joana Prado domina PCR.', 'Disponibilidade integral.'],
        )
        self.analise = PreAnalise.objects.create(
            proposta=proposta,
            versao_criterio=VersaoCriterio.objects.create(versao='V9', vigente_de=date.today()),
            versao_proposta=1,
            sintese='A equipe tem Joana Prado como coordenadora.',
            executada_por='joana@ac2.example',
        )
        self.dimensao = PreAnaliseDimensao.objects.create(
            pre_analise=self.analise,
            dimensao='equipe_supervisao',
            avaliacao='Joana Prado coordena.',
            nivel='consolidada',
            evidencias=['Joana Prado tem doutorado.'],
        )
        self.recomendacao = Recomendacao.objects.create(
            oportunidade=oportunidade,
            origem='pre_analise',
            pre_analise=self.analise,
            texto='Detalhar a dedicacao de Joana Prado.',
        )
        self.lacuna = Lacuna.objects.create(
            proposta=proposta,
            pre_analise=self.analise,
            tipo='pre_analise',
            descricao='Falta o plano de Joana Prado.',
            recomendacao='Descrever o papel de Joana Prado.',
        )
        self.client.force_authenticate(self.administrador)
        self.client.post(reverse('usuario-anonimizar', args=[self.pessoa.pk]))

    def test_as_execucoes_deixam_de_guardar_o_email(self):
        self.execucao_ia.refresh_from_db()
        self.analise.refresh_from_db()

        self.assertEqual(self.execucao_ia.executado_por, PESSOA_REMOVIDA)
        self.assertEqual(ExecucaoMatching.objects.get().executado_por, PESSOA_REMOVIDA)
        self.assertEqual(self.analise.executada_por, PESSOA_REMOVIDA)

    def test_o_nome_sai_do_que_a_ia_escreveu(self):
        for registro in (self.indicacao, self.analise, self.dimensao, self.recomendacao, self.lacuna):
            registro.refresh_from_db()

        self.assertEqual(self.indicacao.justificativa, f'{NOME_ANONIMO} domina PCR.')
        self.assertEqual(
            self.indicacao.match_reasons,
            [f'{NOME_ANONIMO} domina PCR.', 'Disponibilidade integral.'],
        )
        self.assertNotIn('Joana', self.analise.sintese)
        self.assertNotIn('Joana', self.dimensao.avaliacao)
        self.assertNotIn('Joana', str(self.dimensao.evidencias))
        self.assertNotIn('Joana', self.recomendacao.texto)
        self.assertNotIn('Joana', self.lacuna.descricao + self.lacuna.recomendacao)


class EmailForaDoDetalheTests(TestCase):
    def test_cadastro_na_rede_nao_copia_o_email_para_o_detalhe(self):
        client = APIClient()
        supervisor = UsuarioBuilder().supervisor().build()
        client.force_authenticate(supervisor)

        client.post(
            reverse('membro-rede-list'),
            {'nome': 'Carla Dias', 'email': 'carla@ac2.example', 'papel_rede': 'pesquisador'},
            format='json',
        )

        for evento in EventoAuditoria.objects.filter(categoria=CategoriaEvento.REDE):
            self.assertNotIn('carla@ac2.example', str(evento.detalhe))

    def test_editar_membro_registra_so_o_nome_dos_campos(self):
        client = APIClient()
        client.force_authenticate(UsuarioBuilder().supervisor().build())
        membro = (
            MembroRedeBuilder().pesquisador().chamado('Carla Dias')
            .com_experiencia('Dez anos de bancada.').build()
        )

        client.patch(
            reverse('membro-rede-detail', args=[membro.pk]),
            {'nome': 'Carla Souza', 'experiencia': 'Doze anos de bancada.'},
            format='json',
        )

        evento = EventoAuditoria.objects.get(tipo='membro_atualizado')
        self.assertEqual(evento.detalhe['campos'], ['experiencia', 'nome'])
        self.assertNotIn('Carla', str(evento.detalhe))
        self.assertNotIn('bancada', str(evento.detalhe))

    def test_usuario_novo_nao_tem_detalhe_com_email(self):
        administrador = UsuarioBuilder().administrador().build()
        client = APIClient()
        client.force_authenticate(administrador)

        client.post(
            reverse('usuario-list'),
            {'nome': 'Paula Reis', 'email': 'paula@ac2.example', 'papel': 'supervisor'},
            format='json',
        )

        self.assertTrue(Usuario.objects.filter(email='paula@ac2.example').exists())
        for evento in EventoAuditoria.objects.all():
            self.assertNotIn('paula@ac2.example', str(evento.detalhe))
