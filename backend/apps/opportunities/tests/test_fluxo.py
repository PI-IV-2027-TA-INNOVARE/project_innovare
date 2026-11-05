"""
Testes das situacoes da oportunidade e dos portoes do fluxo (P13, IA 4, IA 5).

O que esta sob prova: a lista de mudancas validas, a recusa com motivo, a
proposta sem revisao travando competencias, matching e pre-analise (PB41), a
pre-analise sem equipe recusada (PB50) e Revisar voltando para Em estruturacao
(PB64).

Provedor sempre duble (AGENTS.md 0.1).
"""
import tempfile
from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import ExecucaoIA
from apps.ai.services.base_conhecimento import base_conhecimento
from apps.audit.models import EventoAuditoria
from apps.competencies.models import CompetenciaNecessaria, NivelImportancia
from apps.competencies.services import (
    AdicionarCompetenciaService,
    DerivarCompetenciasService,
    RemoverCompetenciaService,
)
from apps.copilot.models import PropostaEstruturada
from apps.copilot.services import AtualizarPropostaService, IniciarPropostaService
from apps.decisions.models import TipoDecisao
from apps.matching.services import (
    AdicionarMembroService,
    ExecutarMatchingService,
    equipe_atual_de,
)
from apps.maturity.services import ImportarCriteriosService, PreAnalisarService
from apps.opportunities.models import Oportunidade, SituacaoOportunidade as S
from apps.opportunities.services.fluxo import (
    TRANSICOES,
    ajustar_pelos_dados,
    ajuste_pelos_dados,
    mover,
    recusa_da_transicao,
)
from core.exceptions import AcaoNaoPermitida, ConflitoDeEstado
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    UsuarioBuilder,
    indicar_na_equipe,
)
from core.tests.dubles import ProvedorFake, ProvedorIndisponivel, escrever_base_pipe

PROPOSTA = {
    'problema_pesquisa': 'Contaminacao resiste a pasteurizacao.',
    'objetivo_geral': 'Desenvolver protocolo de deteccao rapida.',
    'metodologia': 'Cultivo seletivo e PCR em tempo real.',
}


class TransicoesTests(TestCase):
    def test_a_lista_cobre_todas_as_situacoes(self):
        self.assertEqual(set(TRANSICOES), set(S.values))

    def test_continuar_e_revisar_so_saem_de_aguardando_decisao(self):
        """P13: a decisao vem depois da pre-analise."""
        origens = {
            origem for origem, destinos in TRANSICOES.items()
            if S.CONTINUAR in destinos or S.REVISAR in destinos
        }

        self.assertEqual(origens, {S.AGUARDANDO_DECISAO})

    def test_revisar_so_volta_para_em_estruturacao(self):
        """PB64: Revisar devolve a oportunidade para complementacao."""
        self.assertEqual(set(TRANSICOES[S.REVISAR]), {S.ESTRUTURACAO, S.ARQUIVADA})

    def test_arquivar_vale_em_toda_etapa_em_curso(self):
        """PB67: a que nao seguira adiante sai do fluxo em qualquer etapa."""
        for origem in (S.ENTRADA, S.MATCHING, S.AGUARDANDO_DECISAO, S.REVISAR):
            self.assertIsNone(recusa_da_transicao(origem, S.ARQUIVADA), origem)

    def test_continuar_e_arquivada_nao_tem_saida(self):
        self.assertEqual(TRANSICOES[S.CONTINUAR], ())
        self.assertEqual(TRANSICOES[S.ARQUIVADA], ())

    def test_recusa_explica_o_motivo(self):
        recusa = recusa_da_transicao(S.ENTRADA, S.CONTINUAR)

        self.assertEqual(recusa.codigo, 'transicao_invalida')
        self.assertIn('pré-análise', recusa.detalhe)


class FluxoBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.pesquisador = UsuarioBuilder().pesquisador().build()
        self.oportunidade = OportunidadeBuilder().interna().criada_por(self.supervisor).build()
        self.client.force_authenticate(user=self.supervisor)

    def recarregar(self):
        self.oportunidade.refresh_from_db()
        return self.oportunidade.situacao

    def proposta(self, revisada=True):
        return PropostaEstruturada.objects.create(
            oportunidade=self.oportunidade, revisada_por_humano=revisada, **PROPOSTA
        )

    def na(self, situacao):
        self.oportunidade.situacao = situacao
        self.oportunidade.save(update_fields=['situacao'])

    def decidir(self, tipo):
        return self.client.post(
            reverse('oportunidade-decisao', args=[self.oportunidade.codigo]),
            {'tipo': tipo, 'justificativa': 'Motivo registrado no historico.'},
            format='json',
        )


class ServicoUnicoDeTransicaoTests(FluxoBaseTests):
    def test_api_recusa_continuar_antes_da_pre_analise_e_diz_por_que(self):
        """SPEC-09: a API recusa transicao invalida e diz por que."""
        resposta = self.decidir(TipoDecisao.CONTINUAR)

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'transicao_invalida')
        self.assertIn('pré-análise', resposta.data['detail'])
        self.assertEqual(self.recarregar(), S.ENTRADA)

    def test_decisao_vale_com_a_oportunidade_aguardando_decisao(self):
        self.na(S.AGUARDANDO_DECISAO)

        resposta = self.decidir(TipoDecisao.CONTINUAR)

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(self.recarregar(), S.CONTINUAR)

    def test_arquivar_vale_logo_na_entrada(self):
        resposta = self.decidir(TipoDecisao.ARQUIVAR)

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(self.recarregar(), S.ARQUIVADA)

    def test_quem_nao_e_supervisor_nao_move_a_situacao(self):
        with self.assertRaises(AcaoNaoPermitida):
            mover(self.oportunidade, S.ESTRUTURACAO, self.pesquisador)

    def test_mudanca_de_etapa_fica_na_trilha_com_autor(self):
        IniciarPropostaService().execute(oportunidade=self.oportunidade, ator=self.supervisor)

        evento = EventoAuditoria.objects.get(tipo='situacao_atualizada')
        self.assertEqual(evento.detalhe, {'de': S.ENTRADA, 'para': S.ESTRUTURACAO})
        self.assertEqual(evento.ator, self.supervisor.email)
        self.assertEqual(self.recarregar(), S.ESTRUTURACAO)

    def test_arquivada_nao_volta_ao_fluxo(self):
        self.na(S.ARQUIVADA)

        with self.assertRaises(ConflitoDeEstado) as erro:
            IniciarPropostaService().execute(oportunidade=self.oportunidade, ator=self.supervisor)

        self.assertEqual(erro.exception.codigo, 'ja_arquivada')
        self.assertFalse(PropostaEstruturada.objects.exists())

    def test_refazer_etapa_anterior_nao_volta_a_situacao(self):
        proposta = self.proposta()
        self.na(S.MATCHING)

        AtualizarPropostaService().execute(
            proposta=proposta, dados={'hipotese': 'Nova hipotese.'}, ator=self.supervisor
        )

        self.assertEqual(self.recarregar(), S.MATCHING)
        self.assertFalse(EventoAuditoria.objects.filter(tipo='situacao_atualizada').exists())


class RevisarVoltaParaEstruturacaoTests(FluxoBaseTests):
    def test_revisar_devolve_para_em_estruturacao_quando_a_proposta_e_retomada(self):
        """SPEC-09: Revisar devolve a oportunidade para Em estruturacao."""
        proposta = self.proposta()
        self.na(S.AGUARDANDO_DECISAO)

        self.decidir(TipoDecisao.REVISAR)
        self.assertEqual(self.recarregar(), S.REVISAR)

        AtualizarPropostaService().execute(
            proposta=proposta, dados={'hipotese': 'Hipotese corrigida.'}, ator=self.supervisor
        )

        self.assertEqual(self.recarregar(), S.ESTRUTURACAO)

    def test_em_revisao_as_etapas_seguintes_esperam_a_proposta(self):
        self.proposta()
        self.na(S.REVISAR)

        with self.assertRaises(ConflitoDeEstado) as erro:
            AdicionarCompetenciaService().execute(
                oportunidade=self.oportunidade,
                dados={'descricao': 'Microbiologia de alimentos'},
                ator=self.supervisor,
            )

        self.assertIn('revisão', erro.exception.detalhe)


class PropostaNaoRevisadaTests(FluxoBaseTests):
    def test_competencias_nao_rodam_com_proposta_nao_revisada(self):
        """SPEC-09 / PB41: a IA nem e chamada."""
        self.proposta(revisada=False)

        with self.assertRaises(ConflitoDeEstado) as erro:
            DerivarCompetenciasService(provedor=ProvedorFake()).execute(
                oportunidade=self.oportunidade, ator=self.supervisor
            )

        self.assertEqual(erro.exception.codigo, 'proposta_nao_revisada')
        self.assertFalse(ExecucaoIA.objects.exists())
        self.assertEqual(self.recarregar(), S.ENTRADA)

    def test_api_recusa_competencias_com_proposta_nao_revisada(self):
        self.proposta(revisada=False)

        resposta = self.client.post(
            reverse('oportunidade-competencias', args=[self.oportunidade.codigo]),
            {'descricao': 'Microbiologia de alimentos'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'proposta_nao_revisada')

    def test_matching_nao_roda_com_proposta_nao_revisada(self):
        proposta = self.proposta(revisada=False)
        CompetenciaNecessaria.objects.create(
            proposta=proposta, descricao='Microbiologia de alimentos',
            nivel_importancia=NivelImportancia.ESSENCIAL,
        )

        with self.assertRaises(ConflitoDeEstado) as erro:
            ExecutarMatchingService(provedor=ProvedorFake()).execute(
                oportunidade=self.oportunidade, ator=self.supervisor
            )

        self.assertEqual(erro.exception.codigo, 'proposta_nao_revisada')

    def test_revisada_a_derivacao_roda_e_a_situacao_avanca(self):
        self.proposta()
        self.na(S.ESTRUTURACAO)

        DerivarCompetenciasService(provedor=ProvedorFake()).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

        self.assertEqual(self.recarregar(), S.COMPETENCIAS)


class PreAnaliseDoFluxoTests(FluxoBaseTests):
    def setUp(self):
        super().setUp()
        self.diretorio = tempfile.TemporaryDirectory()
        base = escrever_base_pipe(self.diretorio.name)

        with override_settings(BASE_CONHECIMENTO_PIPE=base):
            base_conhecimento.cache_clear()
            ImportarCriteriosService().execute(
                ator=UsuarioBuilder().administrador().build()
            )

        base_conhecimento.cache_clear()
        self.proposta()
        self.na(S.MATCHING)

    def tearDown(self):
        base_conhecimento.cache_clear()
        self.diretorio.cleanup()

    def analisar(self, provedor=None):
        return PreAnalisarService(provedor=provedor or ProvedorFake()).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

    def test_pre_analise_nao_roda_sem_equipe_potencial(self):
        """SPEC-09 / PB50: "e uma equipe potencial definida"."""
        with self.assertRaises(ConflitoDeEstado) as erro:
            self.analisar()

        self.assertEqual(erro.exception.codigo, 'sem_equipe')
        self.assertFalse(ExecucaoIA.objects.exists())

    def test_equipe_sem_ninguem_incluido_tambem_nao_vale(self):
        indicacao = indicar_na_equipe(
            self.oportunidade, MembroRedeBuilder().pesquisador().build()
        )
        indicacao.incluido = False
        indicacao.save(update_fields=['incluido'])

        with self.assertRaises(ConflitoDeEstado):
            self.analisar()

    def test_resultado_gravado_passa_a_aguardar_decisao(self):
        indicar_na_equipe(self.oportunidade, MembroRedeBuilder().pesquisador().build())

        self.analisar()

        self.assertEqual(self.recarregar(), S.AGUARDANDO_DECISAO)
        self.assertEqual(
            [evento.detalhe['para'] for evento in EventoAuditoria.objects.filter(
                tipo='situacao_atualizada'
            ).order_by('id_evento')],
            [S.PRE_ANALISE, S.AGUARDANDO_DECISAO],
        )

    def test_sem_resultado_fica_em_pre_analise(self):
        indicar_na_equipe(self.oportunidade, MembroRedeBuilder().pesquisador().build())

        self.analisar(ProvedorIndisponivel())

        self.assertEqual(self.recarregar(), S.PRE_ANALISE)


class ConferenciaAntesDoDeployTests(FluxoBaseTests):
    def conferir(self, *argumentos):
        saida = StringIO()
        call_command('conferir_situacoes', *argumentos, stdout=saida)
        return saida.getvalue()

    def test_lista_sem_gravar(self):
        self.proposta()

        saida = self.conferir()

        self.assertIn(self.oportunidade.codigo, saida)
        self.assertIn('Nada foi gravado', saida)
        self.assertEqual(self.recarregar(), S.ENTRADA)

    def test_aplicar_leva_a_situacao_ate_onde_os_dados_chegaram(self):
        proposta = self.proposta()
        CompetenciaNecessaria.objects.create(
            proposta=proposta, descricao='Microbiologia de alimentos',
            nivel_importancia=NivelImportancia.ESSENCIAL,
        )

        self.conferir('--aplicar')

        self.assertEqual(self.recarregar(), S.COMPETENCIAS)
        self.assertTrue(
            EventoAuditoria.objects.get(tipo='situacao_atualizada').detalhe['conferencia']
        )

    def test_decisao_registrada_nao_e_tocada(self):
        self.proposta()
        self.na(S.REVISAR)

        self.conferir('--aplicar')

        self.assertEqual(self.recarregar(), S.REVISAR)

    def test_situacao_adiante_dos_dados_nao_volta(self):
        self.proposta()
        self.na(S.AGUARDANDO_DECISAO)

        self.conferir('--aplicar')

        self.assertEqual(self.recarregar(), S.AGUARDANDO_DECISAO)


class ProvedorQueTiraAEquipe(ProvedorFake):
    """Enquanto a IA responde, outro Supervisor tira a unica pessoa incluida."""

    def __init__(self, indicacao, **kwargs):
        super().__init__(**kwargs)
        self._indicacao = indicacao

    def pre_analise_pipe(self, **kwargs):
        self._indicacao.incluido = False
        self._indicacao.save(update_fields=['incluido'])
        return super().pre_analise_pipe(**kwargs)


class PortoesDentroDaTransacaoTests(PreAnaliseDoFluxoTests):
    def test_pre_analise_nao_grava_se_a_equipe_esvaziou_durante_a_ia(self):
        indicacao = indicar_na_equipe(
            self.oportunidade, MembroRedeBuilder().pesquisador().build()
        )

        with self.assertRaises(ConflitoDeEstado):
            self.analisar(ProvedorQueTiraAEquipe(indicacao))

        self.assertEqual(self.recarregar(), S.MATCHING)


class OportunidadeEncerradaTests(FluxoBaseTests):
    def test_arquivada_nao_ganha_pessoa_nova_na_equipe(self):
        indicar_na_equipe(self.oportunidade, MembroRedeBuilder().pesquisador().build())
        self.na(S.ARQUIVADA)

        with self.assertRaises(ConflitoDeEstado) as erro:
            AdicionarMembroService().execute(
                equipe=equipe_atual_de(self.oportunidade),
                membro_rede=MembroRedeBuilder().pesquisador().build(),
                papel='pesquisador',
                ator=self.supervisor,
            )

        self.assertEqual(erro.exception.codigo, 'ja_arquivada')

    def test_competencia_de_oportunidade_concluida_nao_muda(self):
        proposta = self.proposta()
        competencia = CompetenciaNecessaria.objects.create(
            proposta=proposta, descricao='Microbiologia de alimentos',
            nivel_importancia=NivelImportancia.ESSENCIAL,
        )
        self.na(S.CONTINUAR)

        with self.assertRaises(ConflitoDeEstado) as erro:
            RemoverCompetenciaService().execute(competencia=competencia, ator=self.supervisor)

        self.assertEqual(erro.exception.codigo, 'fluxo_concluido')


class ConferenciaConcorrenteTests(FluxoBaseTests):
    def test_ajuste_nao_desfaz_arquivamento_que_chegou_depois_da_listagem(self):
        proposta = self.proposta()
        CompetenciaNecessaria.objects.create(
            proposta=proposta, descricao='Microbiologia de alimentos',
            nivel_importancia=NivelImportancia.ESSENCIAL,
        )
        self.na(S.ESTRUTURACAO)
        lida = Oportunidade.objects.get(pk=self.oportunidade.pk)
        self.assertEqual(ajuste_pelos_dados(lida), S.COMPETENCIAS)

        Oportunidade.objects.filter(pk=self.oportunidade.pk).update(situacao=S.ARQUIVADA)

        self.assertIsNone(ajustar_pelos_dados(lida))
        self.assertEqual(self.recarregar(), S.ARQUIVADA)
