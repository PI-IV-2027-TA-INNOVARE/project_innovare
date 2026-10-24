"""
Testes do Copiloto de Estruturacao (RF04 / EP04 / PB38, PB39).

Tres invariantes que estes testes cobram, e que sao o motivo de o modulo
existir desta forma:

- a IA **nunca** sobrescreve texto que um humano escreveu;
- toda rodada deixa a proposta como **nao revisada**, porque revisao e ato
  humano (AGENTS.md 0.2 / RN-A07);
- provedor indisponivel **nao** produz conteudo nenhum - produz lacuna e uma
  mensagem dizendo isso.

O provedor e sempre duble: nenhum teste toca o Gemini (AGENTS.md 0.1).
"""
import tempfile

from django.db import connection
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.services.base_conhecimento import base_conhecimento
from apps.audit.models import CategoriaEvento, EventoAuditoria
from apps.copilot.models import (
    AutorMensagem,
    EstadoSessao,
    Lacuna,
    ObjetivoEspecifico,
    PropostaEstruturada,
    Severidade,
    TipoLacuna,
)
from apps.copilot.services import (
    EstruturarPropostaService,
    IniciarSessaoService,
)
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
    indicar_na_equipe,
)
from core.tests.dubles import (
    PROPOSTA_PADRAO,
    ProvedorFake,
    ProvedorIndisponivel,
    ProvedorQueObservaATransacao,
    escrever_base_pipe,
)


class CopilotoBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.diretorio = tempfile.TemporaryDirectory()
        self.base = escrever_base_pipe(self.diretorio.name)

        self.supervisor = UsuarioBuilder().supervisor().build()
        self.pesquisador = UsuarioBuilder().pesquisador().build()
        self.organizacao = OrganizacaoBuilder().demandante().build()
        self.demandante = (
            UsuarioBuilder().demandante().na_organizacao(self.organizacao).build()
        )

        self.oportunidade = (
            OportunidadeBuilder()
            .interna()
            .intitulada('Deteccao rapida de contaminacao')
            .com_contexto('Perdas na linha de envase.', 'Resumo do caso.')
            .criada_por(self.supervisor)
            .build()
        )

        base_conhecimento.cache_clear()
        self.como(self.supervisor)

    def tearDown(self):
        base_conhecimento.cache_clear()
        self.diretorio.cleanup()

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def url(self, sufixo='copiloto'):
        return reverse(f'oportunidade-{sufixo}', args=[self.oportunidade.codigo])

    def iniciar_sessao(self):
        return IniciarSessaoService().execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

    def estruturar(self, provedor=None):
        return EstruturarPropostaService(
            provedor=provedor or ProvedorFake()
        ).execute(oportunidade=self.oportunidade, ator=self.supervisor)


class EstadoDaAbaTests(CopilotoBaseTests):
    def test_aba_nasce_sem_sessao_e_com_os_oito_elementos_vazios(self):
        """RF04: a tela abre antes de existir proposta, sem gravar nada."""
        resposta = self.client.get(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertIsNone(resposta.data['sessao'])
        self.assertFalse(resposta.data['proposta_iniciada'])
        self.assertEqual(len(resposta.data['elementos_vazios']), 8)
        self.assertFalse(PropostaEstruturada.objects.exists())

    def test_supervisor_abre_sessao_e_a_proposta_passa_a_existir(self):
        """PB38: abrir a sessao e o gesto que cria a proposta vazia."""
        resposta = self.client.post(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resposta.data['estado'], EstadoSessao.ABERTA)
        self.assertTrue(PropostaEstruturada.objects.filter(
            oportunidade=self.oportunidade
        ).exists())

    def test_duas_sessoes_abertas_e_conflito(self):
        """Uma conversa por vez: duas sessoes abertas dividiriam o contexto."""
        self.client.post(self.url())
        resposta = self.client.post(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'sessao_duplicada')


class PerguntasOrientadorasTests(CopilotoBaseTests):
    def test_perguntas_vem_da_base_de_conhecimento(self):
        """RF04: pergunta orientadora e conteudo da baseline, nao texto nosso."""
        with override_settings(BASE_CONHECIMENTO_PIPE=self.base):
            base_conhecimento.cache_clear()
            resposta = self.client.get(self.url())

        perguntas = resposta.data['perguntas']

        self.assertTrue(resposta.data['base_disponivel'])
        self.assertEqual(resposta.data['baseline_id'], 'PIPE_TESTE_V9')
        self.assertIn(
            'Qual problema real voce quer resolver?',
            [pergunta['pergunta'] for pergunta in perguntas],
        )

    def test_pergunta_de_etapa_posterior_nao_entra(self):
        """O produto encerra na pre-proposta (`CONTEXT.md` secao 5)."""
        with override_settings(BASE_CONHECIMENTO_PIPE=self.base):
            base_conhecimento.cache_clear()
            resposta = self.client.get(self.url())

        self.assertNotIn(
            'Q099', [pergunta['id'] for pergunta in resposta.data['perguntas']]
        )

    def test_base_ausente_nao_derruba_a_tela(self):
        """Sem base, a tela diz que nao ha pergunta - e nao inventa uma."""
        with override_settings(
            BASE_CONHECIMENTO_PIPE=f'{self.diretorio.name}/inexistente.json'
        ):
            base_conhecimento.cache_clear()
            resposta = self.client.get(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertFalse(resposta.data['base_disponivel'])
        self.assertEqual(resposta.data['perguntas'], [])


class EstruturacaoTests(CopilotoBaseTests):
    def test_rodada_preenche_os_elementos_e_marca_nao_revisada(self):
        """RF04 / RN-A07: a saida existe, mas nasce pendente de revisao humana."""
        resultado = self.estruturar()
        proposta = resultado['proposta']

        self.assertEqual(len(resultado['preenchidos']), 8)
        self.assertFalse(proposta.revisada_por_humano)
        self.assertEqual(
            proposta.objetivo_geral, 'Desenvolver protocolo de deteccao rapida.'
        )
        self.assertIsNotNone(proposta.execucao_ia)

    def test_rodada_nao_sobrescreve_texto_humano(self):
        """A regra que protege a revisao: elemento preenchido nao e tocado."""
        proposta = PropostaEstruturada.objects.create(
            oportunidade=self.oportunidade,
            objetivo_geral='Texto escrito pelo Supervisor.',
            revisada_por_humano=True,
        )

        self.estruturar()
        proposta.refresh_from_db()

        self.assertEqual(proposta.objetivo_geral, 'Texto escrito pelo Supervisor.')

    def test_elemento_vazio_vira_lacuna_com_severidade(self):
        """A hipotese e "quando aplicavel" no RF04 - lacuna media, nao alta."""
        self.estruturar(provedor=ProvedorIndisponivel())

        lacunas = {
            lacuna.campo_afetado: lacuna.severidade
            for lacuna in Lacuna.objects.filter(tipo=TipoLacuna.PROPOSTA)
        }

        self.assertEqual(len(lacunas), 8)
        self.assertEqual(lacunas['hipotese'], Severidade.MEDIA)
        self.assertEqual(lacunas['metodologia'], Severidade.ALTA)

    def test_lacuna_fecha_quando_o_elemento_e_preenchido(self):
        """Lacuna resolvida que fica na tela ensina a ignorar a lista."""
        self.estruturar(provedor=ProvedorIndisponivel())
        self.estruturar(provedor=ProvedorFake())

        self.assertEqual(
            Lacuna.objects.filter(tipo=TipoLacuna.PROPOSTA, resolvida=False).count(),
            0,
        )
        self.assertEqual(
            Lacuna.objects.filter(tipo=TipoLacuna.PROPOSTA, resolvida=True).count(),
            8,
        )

    def test_provedor_indisponivel_nao_inventa_conteudo(self):
        """AGENTS.md 0.2: o fallback e seguro - nao produz proposta simulada."""
        resultado = self.estruturar(provedor=ProvedorIndisponivel())

        self.assertEqual(resultado['preenchidos'], [])
        self.assertTrue(resultado['fallback_usado'])
        self.assertIsNone(resultado['execucao_ia'])
        self.assertEqual(resultado['proposta'].problema_pesquisa, '')

    def test_saida_invalida_do_provedor_nao_grava_nada(self):
        """AGENTS.md 2.2: contrato externo e parseado com fail-fast."""
        quebrado = ProvedorFake(
            proposta={'objetivos_especificos': 'isto deveria ser uma lista'}
        )

        resultado = self.estruturar(provedor=quebrado)

        self.assertEqual(resultado['preenchidos'], [])
        self.assertEqual(resultado['proposta'].objetivos_especificos, [])

    def test_rodada_registra_execucao_na_trilha_com_ai_run_id(self):
        """DoD 4.4: a tela tem de poder dizer de qual execucao veio o texto."""
        resultado = self.estruturar()

        evento = EventoAuditoria.objects.get(
            categoria=CategoriaEvento.COPILOTO, tipo='estruturacao_executada'
        )

        self.assertEqual(evento.execucao_ia_id, resultado['execucao_ia'].pk)
        self.assertEqual(evento.oportunidade_id, self.oportunidade.pk)
        self.assertEqual(len(evento.detalhe['elementos_preenchidos']), 8)

    def test_resposta_humana_entra_na_conversa_e_nao_na_proposta(self):
        """PB39: a resposta e contexto da proxima rodada, nao texto da proposta."""
        self.iniciar_sessao()

        resposta = self.client.post(
            self.url('copiloto-responder'),
            {'texto': 'A perda media e de 4% do lote.'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resposta.data['autor'], AutorMensagem.HUMANO)
        self.assertEqual(
            PropostaEstruturada.objects.get(
                oportunidade=self.oportunidade
            ).problema_pesquisa,
            '',
        )

    def test_responder_sem_sessao_responde_404_explicado(self):
        """O codigo de erro e contrato: a tela oferece abrir a sessao."""
        resposta = self.client.post(
            self.url('copiloto-responder'), {'texto': 'Qualquer coisa.'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resposta.data['codigo'], 'sessao_inexistente')

    def test_sessao_concluida_nao_aceita_resposta(self):
        sessao = self.iniciar_sessao()
        self.client.post(self.url('copiloto-concluir'))

        resposta = self.client.post(
            self.url('copiloto-responder'), {'texto': 'Tarde demais.'},
            format='json',
        )

        sessao.refresh_from_db()
        self.assertEqual(sessao.estado, EstadoSessao.CONCLUIDA)
        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)


class AcessoAoCopilotoTests(CopilotoBaseTests):
    def test_pesquisador_le_mas_nao_estrutura(self):
        """D02: o Pesquisador acompanha; conduzir e do Supervisor."""
        indicar_na_equipe(
            self.oportunidade,
            MembroRedeBuilder().pesquisador().com_acesso(self.pesquisador).build(),
        )
        self.como(self.pesquisador)

        self.assertEqual(self.client.get(self.url()).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post(self.url('copiloto-estruturar')).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_demandante_nao_alcanca_o_copiloto(self):
        """PB71: o Demandante acompanha sem acessar o trabalho interno."""
        self.como(self.demandante)

        self.assertEqual(
            self.client.get(self.url()).status_code, status.HTTP_403_FORBIDDEN
        )


class ChamadaForaDaTransacaoTests(CopilotoBaseTests):
    """A espera pela IA nao segura conexao nem bloqueio do banco."""

    def test_o_provedor_e_chamado_fora_de_transacao_aberta_pelo_caso_de_uso(self):
        provedor = ProvedorQueObservaATransacao()
        antes = len(connection.atomic_blocks)

        with override_settings(BASE_CONHECIMENTO_PIPE=self.base):
            EstruturarPropostaService(provedor=provedor).execute(
                oportunidade=self.oportunidade, ator=self.supervisor
            )

        self.assertEqual(provedor.profundidades, [antes])

    def test_texto_que_o_humano_salvou_durante_a_espera_nao_e_sobrescrito(self):
        """
        Sem a transacao em volta da chamada, a proposta pode mudar enquanto a
        IA responde. O caso de uso tem de reler antes de gravar.
        """
        PropostaEstruturada.objects.create(oportunidade=self.oportunidade)

        def supervisor_salva_a_metodologia():
            PropostaEstruturada.objects.filter(
                oportunidade=self.oportunidade
            ).update(metodologia='Escrita pelo Supervisor durante a espera.')

        provedor = ProvedorQueObservaATransacao(durante=supervisor_salva_a_metodologia)

        with override_settings(BASE_CONHECIMENTO_PIPE=self.base):
            resultado = EstruturarPropostaService(provedor=provedor).execute(
                oportunidade=self.oportunidade, ator=self.supervisor
            )

        proposta = PropostaEstruturada.objects.get(oportunidade=self.oportunidade)
        self.assertEqual(
            proposta.metodologia, 'Escrita pelo Supervisor durante a espera.'
        )
        self.assertNotIn('metodologia', resultado['preenchidos'])
        self.assertEqual(
            proposta.problema_pesquisa, PROPOSTA_PADRAO['problema_pesquisa']
        )


class ObjetivosEspecificosTests(TestCase):
    """
    Caso 6: um objetivo por linha em `Objetivo_Especifico`, na ordem da lista.

    A proposta continua lendo e gravando a lista - quem usa
    `objetivos_especificos` nao precisa saber que ela virou tabela.
    """

    def setUp(self):
        self.proposta = PropostaEstruturada.objects.create(
            oportunidade=OportunidadeBuilder().build()
        )

    def linhas(self):
        return list(
            ObjetivoEspecifico.objects.filter(proposta=self.proposta).values_list(
                'ordem', 'descricao'
            )
        )

    def test_a_lista_vira_uma_linha_por_objetivo_na_ordem(self):
        self.proposta.objetivos_especificos = ['Isolar cepas', 'Validar o metodo']
        self.proposta.save()

        self.assertEqual(
            self.linhas(), [(1, 'Isolar cepas'), (2, 'Validar o metodo')]
        )

    def test_regravar_substitui_a_lista_inteira(self):
        self.proposta.objetivos_especificos = ['Isolar cepas', 'Validar o metodo']
        self.proposta.save()
        self.proposta.objetivos_especificos = ['Escalonar o processo']
        self.proposta.save()

        recarregada = PropostaEstruturada.objects.get(pk=self.proposta.pk)

        self.assertEqual(recarregada.objetivos_especificos, ['Escalonar o processo'])
        self.assertEqual(self.linhas(), [(1, 'Escalonar o processo')])

    def test_gravar_outro_campo_nao_mexe_nos_objetivos(self):
        self.proposta.objetivos_especificos = ['Isolar cepas']
        self.proposta.save()

        recarregada = PropostaEstruturada.objects.get(pk=self.proposta.pk)
        recarregada.metodologia = 'Ensaios em bancada.'
        recarregada.save()

        self.assertEqual(self.linhas(), [(1, 'Isolar cepas')])

    def test_proposta_ainda_nao_gravada_nao_tem_objetivos(self):
        transitoria = PropostaEstruturada(oportunidade=OportunidadeBuilder().build())

        self.assertEqual(transitoria.objetivos_especificos, [])
