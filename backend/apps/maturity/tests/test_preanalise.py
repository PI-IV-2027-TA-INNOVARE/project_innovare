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
import copy
import tempfile
from datetime import date

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
from core.exceptions import ConflitoDeEstado
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
    BASE_PIPE_MINIMA,
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
            oportunidade=self.oportunidade, revisada_por_humano=True, **PROPOSTA
        )
        indicar_na_equipe(
            self.oportunidade, MembroRedeBuilder().pesquisador().chamado('Helena Torres').build()
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

        self.assertEqual(resultado['atualizados'], 0)
        self.assertEqual(CriterioPreAnalise.objects.count(), 2)
        self.assertEqual(VersaoCriterio.objects.count(), 1)

    def test_so_conta_como_revisado_o_criterio_cujo_texto_mudou(self):
        """Antes, reimportar sem mudanca dizia "2 revisados" - e nada mudara."""
        self.importar_criterios()
        dados = copy.deepcopy(BASE_PIPE_MINIMA)
        dados['criteria_8_5'][0]['label'] = 'Metodologia revisada'
        self.base = escrever_base_pipe(self.diretorio.name, dados)

        resultado = self.importar_criterios()

        self.assertEqual(resultado['atualizados'], 1)
        self.assertEqual(
            CriterioPreAnalise.objects.get(codigo='A3').descricao,
            'Metodologia revisada — A metodologia e adequada aos objetivos?',
        )

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


class SituacaoDaBaseTests(PreAnaliseBaseTests):
    """
    O arquivo da base PIPE comparado com a versao em uso.

    E o que a tela de Parametros mostra antes de o Administrador ativar uma
    versao: ativar muda a regua de todas as pre-analises seguintes, entao ele
    precisa ver o que entra, o que muda e o que sai antes de confirmar.
    """

    def setUp(self):
        super().setUp()
        self.como(self.administrador)

    def usar_base(self, dados):
        self.base = escrever_base_pipe(self.diretorio.name, dados)

    def situacao(self):
        with override_settings(BASE_CONHECIMENTO_PIPE=self.base):
            base_conhecimento.cache_clear()
            return self.client.get(reverse('ia-criterios-arquivo'))

    def base_com(self, **mudancas):
        dados = copy.deepcopy(BASE_PIPE_MINIMA)
        dados.update(mudancas)

        return dados

    def test_sem_versao_em_uso_tudo_e_novo_e_ha_o_que_ativar(self):
        resposta = self.situacao()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertTrue(resposta.data['disponivel'])
        self.assertTrue(resposta.data['pendente'])
        self.assertIsNone(resposta.data['versao_em_uso'])
        self.assertEqual(resposta.data['versao_do_arquivo'], 'V9')
        self.assertEqual(
            resposta.data['novos'],
            [
                {'codigo': 'A3', 'titulo': 'Metodologia adequada'},
                {'codigo': 'F1', 'titulo': 'Infraestrutura compativel'},
            ],
        )
        self.assertEqual(resposta.data['sem_dimensao'], ['ZZ9'])

    def test_depois_de_ativar_o_mesmo_arquivo_nao_ha_nada_pendente(self):
        self.importar_criterios()

        resposta = self.situacao()

        self.assertFalse(resposta.data['pendente'])
        self.assertEqual(resposta.data['versao_em_uso'], 'V9')
        self.assertEqual(resposta.data['novos'], [])
        self.assertEqual(resposta.data['alterados'], [])
        self.assertEqual(resposta.data['removidos'], [])

    def test_versao_nova_mostra_o_que_entra_o_que_muda_e_o_que_sai(self):
        self.importar_criterios()
        criterios = copy.deepcopy(BASE_PIPE_MINIMA['criteria_8_5'])
        criterios[0]['label'] = 'Metodologia revisada'
        criterios[1] = {
            'id': 'B1',
            'component': 'Equipe',
            'label': 'Lideranca tecnica',
            'evaluation_question': 'Ha quem lidere?',
        }
        self.usar_base(
            self.base_com(
                versioning=[{'version': 'V10', 'status': 'ATIVA'}],
                criteria_8_5=criterios,
            )
        )

        resposta = self.situacao()

        self.assertTrue(resposta.data['pendente'])
        self.assertEqual(resposta.data['versao_do_arquivo'], 'V10')
        self.assertEqual(resposta.data['versao_em_uso'], 'V9')
        self.assertEqual(
            resposta.data['novos'], [{'codigo': 'B1', 'titulo': 'Lideranca tecnica'}]
        )
        self.assertEqual(
            resposta.data['alterados'], [{'codigo': 'A3', 'titulo': 'Metodologia revisada'}]
        )
        self.assertEqual(
            resposta.data['removidos'],
            [{'codigo': 'F1', 'titulo': 'Infraestrutura compativel'}],
        )

    def test_na_mesma_versao_nada_sai_porque_a_importacao_nao_apaga(self):
        """Reativar a mesma versao revisa texto; criterio que sumiu do arquivo fica."""
        self.importar_criterios()
        criterios = copy.deepcopy(BASE_PIPE_MINIMA['criteria_8_5'])
        criterios[0]['label'] = 'Metodologia revisada'
        del criterios[1]
        self.usar_base(self.base_com(criteria_8_5=criterios))

        resposta = self.situacao()

        self.assertTrue(resposta.data['pendente'])
        self.assertEqual(
            resposta.data['alterados'], [{'codigo': 'A3', 'titulo': 'Metodologia revisada'}]
        )
        self.assertEqual(resposta.data['removidos'], [])

    def test_diz_de_qual_chamada_a_base_veio(self):
        dados = self.base_com()
        dados['metadata']['call'] = '1ª Rodada 2026 — Chamada FAPESP 33/2026'
        self.usar_base(dados)

        resposta = self.situacao()

        self.assertEqual(resposta.data['chamada'], '1ª Rodada 2026 — Chamada FAPESP 33/2026')

    def test_revisao_prevista_pela_propria_base_e_avisada_com_a_data(self):
        """A base registra a V3 "15/09/2026 ou apos": o Administrador precisa saber."""
        versioning = copy.deepcopy(BASE_PIPE_MINIMA['versioning']) + [
            {
                'version': 'V10 planejada',
                'date': '15/09/2020 ou após',
                'change': 'Reavaliar novas Normas PIPE.',
                'status': 'PENDENTE',
            }
        ]
        self.usar_base(self.base_com(versioning=versioning))

        revisao = self.situacao().data['revisao_prevista']

        self.assertEqual(revisao['data'], date(2020, 9, 15).isoformat())
        self.assertEqual(revisao['descricao'], 'Reavaliar novas Normas PIPE.')
        self.assertTrue(revisao['vencida'])

    def test_revisao_futura_ainda_nao_esta_vencida(self):
        versioning = copy.deepcopy(BASE_PIPE_MINIMA['versioning']) + [
            {
                'version': 'V10 planejada',
                'date': '15/09/2099',
                'change': 'Nova rodada.',
                'status': 'PENDENTE',
            }
        ]
        self.usar_base(self.base_com(versioning=versioning))

        self.assertFalse(self.situacao().data['revisao_prevista']['vencida'])

    def test_sem_revisao_planejada_nao_ha_aviso(self):
        self.assertIsNone(self.situacao().data['revisao_prevista'])

    def test_arquivo_ausente_e_dito_sem_erro(self):
        """A tela explica a ausencia; o 409 fica para quem tenta ativar."""
        self.base = f'{self.diretorio.name}/inexistente.json'

        resposta = self.situacao()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertFalse(resposta.data['disponivel'])
        self.assertFalse(resposta.data['pendente'])

    def test_so_o_administrador_consulta(self):
        self.como(self.supervisor)

        self.assertEqual(self.situacao().status_code, status.HTTP_403_FORBIDDEN)


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

    def test_execucao_barrada_pelo_limite_de_gasto_diz_o_motivo(self):
        self.importar_criterios()

        analise = self.analisar(provedor=ProvedorIndisponivel(motivo='limite_da_oportunidade'))

        self.assertEqual(analise.status, StatusExecucao.ERRO)
        self.assertEqual(analise.erro, 'limite_da_oportunidade')

    def test_execucao_barrada_pelo_limite_do_mes_diz_o_motivo(self):
        self.importar_criterios()

        analise = self.analisar(provedor=ProvedorIndisponivel(motivo='limite_do_mes'))

        self.assertEqual(analise.erro, 'limite_do_mes')

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
            texto, _ = _texto_da_equipe(oportunidade)

        return len(consultas), texto

    def test_o_numero_de_consultas_nao_cresce_com_a_equipe(self):
        uma, _ = self._consultas_para(self._equipe_com(1))
        cinco, texto = self._consultas_para(self._equipe_com(5))

        self.assertEqual(uma, cinco)
        self.assertEqual(texto.count('- Pesquisador '), 5)
        self.assertNotIn('Pessoa', texto)


class MembroInativoNaPreAnaliseTests(PreAnaliseBaseTests):
    """
    Quem foi inativado continua na equipe antiga, marcado (SPEC-11), mas nao
    vai mais para a pre-analise: a IA avaliaria uma equipe que nao existe.
    """

    def _equipe_com_inativo(self):
        from apps.matching.models import EquipePotencial, MembroEquipe

        oportunidade = (
            OportunidadeBuilder().interna().criada_por(self.supervisor).build()
        )
        equipe = EquipePotencial.objects.create(oportunidade=oportunidade)

        for membro in (
            MembroRedeBuilder().pesquisador().chamado('Pessoa Ativa').build(),
            MembroRedeBuilder().pesquisador().chamado('Pessoa Inativa').inativo().build(),
        ):
            MembroEquipe.objects.create(
                equipe=equipe, membro=membro, papel=membro.papel_rede
            )

        return oportunidade

    def test_membro_inativo_fica_fora_do_texto_da_equipe(self):
        texto, apelidos = _texto_da_equipe(self._equipe_com_inativo())

        self.assertEqual(texto.count('- Pesquisador '), 1)
        self.assertEqual(apelidos.restaurar('Pesquisador A'), 'Pessoa Ativa')

    def test_equipe_so_com_inativos_nao_vai_para_a_pre_analise(self):
        from apps.matching.models import MembroEquipe

        MembroEquipe.objects.filter(
            equipe__oportunidade=self.oportunidade
        ).update(incluido=True)
        membro = MembroEquipe.objects.get(equipe__oportunidade=self.oportunidade).membro
        membro.situacao = 'inativo'
        membro.save(update_fields=['situacao'])
        self.importar_criterios()

        with self.assertRaisesMessage(ConflitoDeEstado, 'ativa'):
            self.analisar()


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
            {'id': f'L{indice}', 'dimensao': 'infraestrutura', 'descricao': f'Lacuna {indice}.'}
            for indice in range(lacunas)
        ],
        'recomendacoes': [
            {'lacuna': f'L{indice}', 'texto': 'Descrever a infraestrutura disponivel.'}
            for indice in range(lacunas)
        ],
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
