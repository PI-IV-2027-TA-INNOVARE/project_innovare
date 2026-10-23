"""
Testes da Pre-analise de Maturidade PIPE/FAPESP (RF09, RF10 / EP06).

O que estes testes protegem, em ordem de importancia:

1. **Vocabulario.** O resultado nunca se apresenta como nota, parecer ou
   decisao da FAPESP (AGENTS.md 0.2).
2. **Criterio cadastrado.** Sem versao vigente a operacao recusa: analisar
   contra criterio que ninguem ratificou nao e analise (P4).
3. **Sem IA nao ha resultado.** Provedor indisponivel grava execucao com erro e
   nenhuma dimensao - nunca um relatorio simulado.

Provedor sempre duble (AGENTS.md 0.1).
"""
import tempfile

from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import StatusExecucao
from apps.ai.services.base_conhecimento import base_conhecimento
from apps.audit.models import CategoriaEvento, EventoAuditoria
from apps.copilot.models import Lacuna, PropostaEstruturada, TipoLacuna
from apps.maturity.models import (
    CriterioPreAnalise,
    DimensaoMaturidade,
    PreAnalise,
    Recomendacao,
    VersaoCriterio,
)
from apps.maturity.serializers import AVISO_ORIENTATIVO
from apps.maturity.services import ImportarCriteriosService, PreAnalisarService
from apps.maturity.services.preanalise import _texto_da_equipe
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
    indicar_na_equipe,
)
from core.tests.dubles import (
    ProvedorFake,
    ProvedorIndisponivel,
    ProvedorQueObservaATransacao,
    escrever_base_pipe,
)

PROPOSTA = {
    'problema_pesquisa': 'Contaminacao resiste a pasteurizacao.',
    'objetivo_geral': 'Desenvolver protocolo de deteccao rapida.',
    'metodologia': 'Cultivo seletivo e PCR em tempo real.',
}

PALAVRAS_PROIBIDAS = ('nota', 'parecer', 'aprovacao', 'aprovação', 'submissao')


class PreAnaliseBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.diretorio = tempfile.TemporaryDirectory()
        self.base = escrever_base_pipe(self.diretorio.name)

        self.administrador = UsuarioBuilder().administrador().build()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.pesquisador = UsuarioBuilder().pesquisador().build()
        self.demandante = (
            UsuarioBuilder()
            .demandante()
            .na_organizacao(OrganizacaoBuilder().demandante().build())
            .build()
        )

        self.oportunidade = (
            OportunidadeBuilder().interna().criada_por(self.supervisor).build()
        )
        self.proposta = PropostaEstruturada.objects.create(
            oportunidade=self.oportunidade, **PROPOSTA
        )

        base_conhecimento.cache_clear()
        self.como(self.supervisor)

    def tearDown(self):
        base_conhecimento.cache_clear()
        self.diretorio.cleanup()

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def url(self, sufixo='pre-analise', *args):
        return reverse(
            f'oportunidade-{sufixo}', args=[self.oportunidade.codigo, *args]
        )

    def importar_criterios(self):
        with override_settings(BASE_CONHECIMENTO_PIPE=self.base):
            base_conhecimento.cache_clear()
            return ImportarCriteriosService().execute(ator=self.administrador)

    def analisar(self, provedor=None):
        return PreAnalisarService(provedor=provedor or ProvedorFake()).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )


class CriteriosTests(PreAnaliseBaseTests):
    def test_importacao_traz_os_criterios_da_baseline(self):
        """RF09: criterio vem da Base de Conhecimento versionada, nao da tela."""
        resultado = self.importar_criterios()

        self.assertEqual(resultado['versao'], 'V9')
        self.assertEqual(resultado['baseline_id'], 'PIPE_TESTE_V9')
        self.assertEqual(resultado['criados'], 2)
        self.assertEqual(
            CriterioPreAnalise.objects.get(codigo='A3').dimensao,
            DimensaoMaturidade.PLANO_PESQUISA,
        )

    def test_criterio_sem_dimensao_mapeada_fica_de_fora_e_e_declarado(self):
        """O que nao tem dimensao nao entra calado: o evento registra o codigo."""
        resultado = self.importar_criterios()

        self.assertEqual(resultado['sem_dimensao'], ['ZZ9'])
        self.assertFalse(CriterioPreAnalise.objects.filter(codigo='ZZ9').exists())

    def test_importacao_registra_o_baseline_no_evento(self):
        """A coluna `versao` cabe 12 caracteres; o baseline_id completo fica aqui."""
        self.importar_criterios()

        evento = EventoAuditoria.objects.get(tipo='criterios_importados')

        self.assertEqual(evento.detalhe['baseline_id'], 'PIPE_TESTE_V9')

    def test_a_versao_guarda_baseline_e_vigencia_uma_vez_so(self):
        """
        Desvio 1 da 3FN: a vigencia e da versao, e nao se repete em cada
        criterio dela.
        """
        self.importar_criterios()

        versao = VersaoCriterio.objects.get()

        self.assertEqual(versao.versao, 'V9')
        self.assertEqual(versao.baseline, 'PIPE_TESTE_V9')
        self.assertIsNone(versao.vigente_ate)
        self.assertEqual(
            set(CriterioPreAnalise.objects.values_list('versao_criterio', flat=True)),
            {versao.pk},
        )

    def test_segunda_importacao_atualiza_em_vez_de_duplicar(self):
        self.importar_criterios()
        resultado = self.importar_criterios()

        self.assertEqual(resultado['atualizados'], 2)
        self.assertEqual(CriterioPreAnalise.objects.count(), 2)
        self.assertEqual(VersaoCriterio.objects.count(), 1)

    def test_base_ausente_e_conflito_explicado(self):
        with override_settings(
            BASE_CONHECIMENTO_PIPE=f'{self.diretorio.name}/inexistente.json'
        ):
            base_conhecimento.cache_clear()
            self.como(self.administrador)
            resposta = self.client.post(reverse('ia-criterios'))

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'base_indisponivel')

    def test_so_o_administrador_importa(self):
        """Parametros e console do Administrador."""
        resposta = self.client.post(reverse('ia-criterios'))

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_supervisor_le_os_criterios_vigentes(self):
        """Ele precisa da versao para interpretar o relatorio."""
        self.importar_criterios()

        resposta = self.client.get(reverse('ia-criterios'))

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resposta.data), 2)

    def test_rotulos_das_dimensoes_chegam_acentuados_a_tela(self):
        """O rotulo vai direto para a interface: sem acento, a tela sai errada."""
        self.assertEqual(
            [rotulo for _, rotulo in DimensaoMaturidade.choices],
            [
                'Desafio tecnológico',
                'Inovação',
                'Plano de pesquisa',
                'Equipe e supervisão',
                'Infraestrutura',
                'Viabilidade',
            ],
        )


class ExecucaoDaPreAnaliseTests(PreAnaliseBaseTests):
    def test_sem_criterio_cadastrado_a_analise_recusa(self):
        """P4: nao se analisa contra criterio que ninguem ratificou."""
        resposta = self.client.post(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'criterios_ausentes')

    def test_analise_grava_dimensoes_lacunas_e_recomendacoes(self):
        """RF09: dimensoes avaliadas, lacunas e recomendacoes."""
        self.importar_criterios()
        analise = self.analisar()

        self.assertEqual(analise.status, StatusExecucao.OK)
        self.assertEqual(analise.dimensoes.count(), 2)
        self.assertEqual(
            Lacuna.objects.filter(tipo=TipoLacuna.PRE_ANALISE).count(), 1
        )
        self.assertEqual(Recomendacao.objects.count(), 1)

    def test_analise_cita_a_versao_dos_criterios_e_da_proposta(self):
        """Uma analise de outubro tem de continuar legivel em dezembro."""
        self.importar_criterios()
        analise = self.analisar()

        self.assertEqual(analise.versao_criterios, 'V9')
        self.assertEqual(analise.versao_criterio, VersaoCriterio.objects.get(versao='V9'))
        self.assertEqual(analise.versao_proposta, self.proposta.versao)

    def test_lacuna_da_pre_analise_nasce_sem_severidade(self):
        """O provedor nao devolve gravidade - inventar seria preencher por ele."""
        self.importar_criterios()
        self.analisar()

        lacuna = Lacuna.objects.get(tipo=TipoLacuna.PRE_ANALISE)

        self.assertIsNone(lacuna.severidade)

    def test_dimensao_fora_do_glossario_invalida_a_saida(self):
        """AGENTS.md 2.2: rotulo novo quebraria a leitura comparada."""
        self.importar_criterios()

        analise = self.analisar(
            provedor=ProvedorFake(
                preanalise={
                    'dimensoes': [
                        {
                            'dimensao': 'dimensao_inventada',
                            'avaliacao': 'x',
                            'nivel': 'consolidada',
                        }
                    ],
                    'lacunas': [],
                    'recomendacoes': [],
                    'sintese': 'nada',
                }
            )
        )

        self.assertEqual(analise.status, StatusExecucao.ERRO)
        self.assertEqual(analise.erro, 'saida_invalida')
        self.assertEqual(analise.dimensoes.count(), 0)

    def test_provedor_indisponivel_nao_fabrica_relatorio(self):
        """AGENTS.md 0.2: a execucao fica registrada, com erro e sem dimensao."""
        self.importar_criterios()

        analise = self.analisar(provedor=ProvedorIndisponivel())

        self.assertEqual(analise.status, StatusExecucao.ERRO)
        self.assertEqual(analise.erro, 'provedor_indisponivel')
        self.assertEqual(analise.dimensoes.count(), 0)
        self.assertEqual(analise.sintese, '')

    def test_reavaliacao_cria_execucao_nova_sem_apagar_a_anterior(self):
        """RF10: reavaliar depois das melhorias e o caso previsto."""
        self.importar_criterios()
        primeira = self.analisar()
        segunda = self.analisar()

        self.assertNotEqual(primeira.pk, segunda.pk)
        self.assertEqual(PreAnalise.objects.count(), 2)

    def test_leitura_devolve_a_ultima_com_o_aviso_orientativo(self):
        """O aviso viaja com o dado para a tela nao poder esquecer."""
        self.importar_criterios()
        self.analisar()

        resposta = self.client.get(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['aviso'], AVISO_ORIENTATIVO)

    def test_vocabulario_do_contrato_nao_tem_nota_nem_parecer(self):
        """`CONTEXT.md` secao 4: o relatorio nao e nota nem parecer."""
        self.importar_criterios()
        self.analisar()

        resposta = self.client.get(self.url())
        campos = ' '.join(resposta.data.keys()).lower()

        for proibida in PALAVRAS_PROIBIDAS:
            self.assertNotIn(proibida, campos)

    def test_analise_usa_a_equipe_quando_existe(self):
        """A dimensao Equipe e supervisao le a composicao sugerida."""
        self.importar_criterios()
        indicar_na_equipe(
            self.oportunidade,
            MembroRedeBuilder().pesquisador().chamado('Marina Alves').build(),
        )

        duble = ProvedorFake()
        PreAnalisarService(provedor=duble).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

        self.assertIn('pre_analise_pipe', duble.chamadas)

    def test_execucao_deixa_evento_na_trilha(self):
        self.importar_criterios()
        self.analisar()

        evento = EventoAuditoria.objects.get(
            categoria=CategoriaEvento.PREANALISE, tipo='execucao'
        )

        self.assertEqual(evento.detalhe['versao_criterios'], 'V9')
        self.assertEqual(evento.detalhe['dimensoes'], 2)


class RecomendacoesTests(PreAnaliseBaseTests):
    def test_supervisor_marca_a_recomendacao_como_acatada(self):
        """RF10: sem marcar o que foi feito, a reavaliacao nao se le."""
        self.importar_criterios()
        self.analisar()
        recomendacao = Recomendacao.objects.first()

        resposta = self.client.patch(
            self.url('recomendacao', recomendacao.id_recomendacao),
            {'acatada': True},
            format='json',
        )

        recomendacao.refresh_from_db()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertTrue(recomendacao.acatada)
        self.assertIsNotNone(recomendacao.acatada_em)


class AcessoAPreAnaliseTests(PreAnaliseBaseTests):
    def test_pesquisador_le_mas_nao_executa(self):
        self.importar_criterios()
        self.analisar()
        indicar_na_equipe(
            self.oportunidade,
            MembroRedeBuilder().pesquisador().com_acesso(self.pesquisador).build(),
        )
        self.como(self.pesquisador)

        self.assertEqual(self.client.get(self.url()).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post(self.url()).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_demandante_nao_ve_pre_analise(self):
        """PB71: "pre-analise detalhada" e o exemplo que o PBI cita."""
        self.importar_criterios()
        self.analisar()
        self.como(self.demandante)

        self.assertEqual(
            self.client.get(self.url()).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_sem_analise_a_leitura_responde_404_explicado(self):
        resposta = self.client.get(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resposta.data['codigo'], 'preanalise_inexistente')


class ChamadaForaDaTransacaoTests(PreAnaliseBaseTests):
    """A espera pela IA nao segura conexao nem bloqueio do banco."""

    def test_o_provedor_e_chamado_fora_de_transacao_aberta_pelo_caso_de_uso(self):
        self.importar_criterios()
        provedor = ProvedorQueObservaATransacao()
        antes = len(connection.atomic_blocks)

        self.analisar(provedor=provedor)

        self.assertEqual(provedor.profundidades, [antes])


class TextoDaEquipeTests(PreAnaliseBaseTests):
    """
    Montar a equipe para o prompt custa o mesmo para 1 ou 5 pessoas.

    Eram duas consultas por pessoa (o membro e a titulacao), e com o banco de
    homologacao remoto cada uma e uma ida e volta pela rede.
    """

    def _equipe_com(self, quantidade):
        from apps.matching.models import EquipePotencial, MembroEquipe

        oportunidade = (
            OportunidadeBuilder().interna().criada_por(self.supervisor).build()
        )
        equipe = EquipePotencial.objects.create(oportunidade=oportunidade)

        for indice in range(quantidade):
            membro = (
                MembroRedeBuilder()
                .pesquisador()
                .chamado(f'Pessoa {indice}')
                .com_titulacao('doutorado')
                .build()
            )
            MembroEquipe.objects.create(
                equipe=equipe, membro=membro, papel=membro.papel_rede
            )

        return oportunidade

    def _consultas_para(self, oportunidade):
        with CaptureQueriesContext(connection) as consultas:
            texto = _texto_da_equipe(oportunidade)

        return len(consultas), texto

    def test_o_numero_de_consultas_nao_cresce_com_a_equipe(self):
        uma, _ = self._consultas_para(self._equipe_com(1))
        cinco, texto = self._consultas_para(self._equipe_com(5))

        self.assertEqual(uma, cinco)
        self.assertEqual(texto.count('Pessoa'), 5)


def _preanalise_com(niveis, lacunas=1):
    return {
        'dimensoes': [
            {
                'dimensao': dimensao,
                'avaliacao': f'Avaliacao de {dimensao}.',
                'nivel': nivel,
                'evidencias': [],
            }
            for dimensao, nivel in niveis.items()
        ],
        'lacunas': [
            {'dimensao': 'infraestrutura', 'descricao': f'Lacuna {indice}.'}
            for indice in range(lacunas)
        ],
        'recomendacoes': ['Descrever a infraestrutura disponivel.'],
        'sintese': 'Sintese da rodada.',
    }


class ComparacaoComAAnteriorTests(PreAnaliseBaseTests):
    """
    PB59: a reavaliacao "permite comparar a evolucao em relacao a anterior".

    Toda execucao ja ficava guardada; o que faltava era a comparacao. Ela e
    por nivel de cada dimensao - rotulo orientativo, nunca nota (AGENTS.md
    0.2) - e pela quantidade de lacunas.
    """

    def setUp(self):
        super().setUp()
        self.importar_criterios()

    def rodada(self, niveis, lacunas=1):
        return self.analisar(
            provedor=ProvedorFake(preanalise=_preanalise_com(niveis, lacunas))
        )

    def comparacao(self):
        resposta = self.client.get(self.url())
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        return resposta.data['comparacao']

    def test_a_primeira_analise_nao_tem_com_o_que_comparar(self):
        self.rodada({'inovacao': 'fragil'})

        self.assertIsNone(self.comparacao())

    def test_compara_o_nivel_de_cada_dimensao_com_a_rodada_anterior(self):
        anterior = self.rodada(
            {'inovacao': 'fragil', 'viabilidade': 'consolidada', 'infraestrutura': 'fragil'},
            lacunas=3,
        )
        self.rodada(
            {'inovacao': 'em_desenvolvimento', 'viabilidade': 'fragil', 'plano_pesquisa': 'fragil'},
            lacunas=1,
        )

        comparacao = self.comparacao()
        movimentos = {
            item['dimensao']: (item['nivel_anterior'], item['nivel_atual'], item['movimento'])
            for item in comparacao['dimensoes']
        }

        self.assertEqual(comparacao['anterior']['id_pre_analise'], str(anterior.id_pre_analise))
        self.assertEqual(movimentos['inovacao'], ('fragil', 'em_desenvolvimento', 'avancou'))
        self.assertEqual(movimentos['viabilidade'], ('consolidada', 'fragil', 'recuou'))
        self.assertEqual(movimentos['plano_pesquisa'], (None, 'fragil', 'nova'))
        self.assertEqual(movimentos['infraestrutura'], ('fragil', None, 'sem_avaliacao'))
        self.assertEqual(comparacao['lacunas'], {'anterior': 3, 'atual': 1})

    def test_rodada_que_falhou_nao_serve_de_referencia(self):
        self.rodada({'inovacao': 'fragil'})
        self.analisar(provedor=ProvedorIndisponivel())
        self.rodada({'inovacao': 'consolidada'})

        movimento = self.comparacao()['dimensoes'][0]

        self.assertEqual(movimento['nivel_anterior'], 'fragil')
        self.assertEqual(movimento['movimento'], 'avancou')

    def test_sinaliza_quando_os_criterios_mudaram_entre_as_rodadas(self):
        self.rodada({'inovacao': 'fragil'})
        self.rodada({'inovacao': 'fragil'})

        self.assertTrue(self.comparacao()['mesmos_criterios'])
