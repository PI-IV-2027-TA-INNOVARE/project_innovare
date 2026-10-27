"""
Testes do Matching e da Equipe Potencial (RF06, RF07, RF08 / EP05).

Duas familias de teste, de proposito separadas:

- **O motor** (`MotorDeMatching`) - calculo puro. E aqui que se cobra o uso dos
  pesos de configuracao, a renormalizacao quando a base semantica nao existe
  (plano 8.3) e a justificativa legivel.
- **O caso de uso** - persistencia, lacunas, ajuste humano e permissao.

Nenhum teste chama provedor externo: o rerank fica desligado pela settings de
teste (AGENTS.md 0.1) e, quando exercitado, recebe duble.
"""
from django.db import connection
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.audit.models import CategoriaEvento, EventoAuditoria
from apps.competencies.models import CompetenciaNecessaria, NivelImportancia
from apps.copilot.models import PropostaEstruturada
from apps.matching.models import (
    EquipePotencial,
    ExecucaoMatching,
    LacunaCompetenciaEquipe,
    MembroEquipe,
    OrigemIndicacao,
)
from apps.matching.services import (
    ExecutarMatchingService,
    MotorDeMatching,
    candidato_de,
    termos,
)
from apps.network.models import Disponibilidade, PapelNaRede
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
    indicar_na_equipe,
)
from core.tests.dubles import ProvedorFake, ProvedorQueObservaATransacao

PROPOSTA = {
    'problema_pesquisa': 'Contaminacao por Alicyclobacillus na linha de envase.',
    'objetivo_geral': 'Desenvolver protocolo de deteccao rapida.',
    'metodologia': 'Cultivo seletivo e PCR em tempo real.',
}


class MatchingBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()

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

        self.essencial = CompetenciaNecessaria.objects.create(
            proposta=self.proposta,
            descricao='Microbiologia de alimentos',
            nivel_importancia=NivelImportancia.ESSENCIAL,
        )
        self.desejavel = CompetenciaNecessaria.objects.create(
            proposta=self.proposta,
            descricao='Estatistica aplicada',
            nivel_importancia=NivelImportancia.DESEJAVEL,
        )

        self.especialista = (
            MembroRedeBuilder()
            .pesquisador()
            .chamado('Marina Alves')
            .com_titulacao('doutorado')
            .integral()
            .com_competencia('Microbiologia de alimentos')
            .com_linha_de_pesquisa('Seguranca de alimentos')
            .com_experiencia('Dez anos em microbiologia de alimentos.')
            .build()
        )
        self.alheio = (
            MembroRedeBuilder()
            .pesquisador()
            .chamado('Bruno Dias')
            .com_titulacao('graduacao')
            .com_competencia('Projeto de embalagens')
            .build()
        )

        self.como(self.supervisor)

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def url(self, sufixo='equipe', *args):
        return reverse(
            f'oportunidade-{sufixo}', args=[self.oportunidade.codigo, *args]
        )

    def rodar(self):
        return ExecutarMatchingService().execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )


class MotorTests(MatchingBaseTests):
    def test_termos_ignoram_acento_e_caixa(self):
        """Perfil e proposta sao digitados por gente diferente."""
        self.assertEqual(termos('Fermentação Industrial'), {'fermentacao', 'industrial'})

    def test_quem_declara_a_competencia_pontua_mais(self):
        """RF07: a comparacao e entre competencia necessaria e perfil."""
        motor = MotorDeMatching()

        avaliacoes = motor.avaliar(
            [self.essencial, self.desejavel],
            [candidato_de(self.especialista), candidato_de(self.alheio)],
        )

        self.assertEqual(avaliacoes[0].membro, self.especialista)
        self.assertGreater(avaliacoes[0].score, avaliacoes[1].score)

    def test_score_declara_a_ausencia_da_base_semantica(self):
        """Plano 8.3: sem embedding, o componente sai da conta - e aparece."""
        avaliacao = MotorDeMatching().avaliar(
            [self.essencial], [candidato_de(self.especialista)]
        )[0]

        self.assertIsNone(avaliacao.features['semantico'])
        self.assertTrue(
            any('Afinidade com o tema indisponível' in motivo for motivo in avaliacao.motivos)
        )

    def test_score_fica_na_escala_zero_um(self):
        """A renormalizacao preserva o significado de AI_MATCH_MIN_SCORE."""
        avaliacao = MotorDeMatching().avaliar(
            [self.essencial], [candidato_de(self.especialista)]
        )[0]

        self.assertGreaterEqual(avaliacao.score, 0.0)
        self.assertLessEqual(avaliacao.score, 1.0)

    def test_indisponivel_perde_o_componente_de_disponibilidade(self):
        """Competencia sem disponibilidade produz equipe que nao se sustenta."""
        self.especialista.disponibilidade = Disponibilidade.INDISPONIVEL
        self.especialista.save(update_fields=['disponibilidade', 'atualizado_em'])

        avaliacao = MotorDeMatching().avaliar(
            [self.essencial], [candidato_de(self.especialista)]
        )[0]

        self.assertEqual(avaliacao.features['disponibilidade'], 0.0)

    def test_justificativa_cita_a_competencia_e_a_titulacao(self):
        """Glossario: a Justificativa do Matching tem de ser legivel."""
        avaliacao = MotorDeMatching().avaliar(
            [self.essencial], [candidato_de(self.especialista)]
        )[0]

        texto = ' '.join(avaliacao.motivos)

        self.assertIn('Microbiologia de alimentos', texto)
        self.assertIn('Doutorado', texto)

    @override_settings(AI_MATCH_PESO_DESEJAVEL=0.0)
    def test_peso_da_desejavel_vem_da_configuracao(self):
        """AGENTS.md 2.4: peso e configuracao, nao numero no codigo."""
        self.assertEqual(MotorDeMatching().peso_desejavel, 0.0)


class ExecucaoDoMatchingTests(MatchingBaseTests):
    def test_rodada_cria_equipe_com_justificativa_e_features(self):
        """RF06: a sugestao chega com o porque, nao so com o numero."""
        resultado = self.rodar()
        membro = resultado['equipe'].membros.first()

        self.assertEqual(resultado['avaliados'], 2)
        self.assertTrue(membro.match_reasons)
        self.assertIn('lexical', membro.score_features)
        self.assertEqual(membro.origem, OrigemIndicacao.IA)

    def test_rodada_registra_os_pesos_que_usou(self):
        """Reler um matching antigo depois de o PO mexer nos pesos."""
        execucao = self.rodar()['execucao']

        self.assertEqual(execucao.estrategia, 'hibrido_v1')
        self.assertIn('componentes', execucao.pesos)
        self.assertTrue(execucao.fallback_usado)
        self.assertFalse(execucao.usou_rerank)

    def test_papel_sugerido_vem_da_rede(self):
        """RF02: quem e Supervisor esta declarado, nao e inferido do score."""
        supervisor_da_rede = (
            MembroRedeBuilder()
            .supervisor()
            .chamado('Rafael Antunes')
            .com_competencia('Microbiologia de alimentos')
            .build()
        )

        self.rodar()
        indicacao = MembroEquipe.objects.get(membro=supervisor_da_rede)

        self.assertEqual(indicacao.papel, PapelNaRede.SUPERVISOR)

    @override_settings(AI_MATCH_MIN_SCORE=0.99)
    def test_abaixo_do_minimo_nao_entra(self):
        """O limiar e configuracao: acima dele a pessoa nao e sugerida."""
        resultado = self.rodar()

        self.assertEqual(resultado['equipe'].membros.count(), 0)

    def test_competencia_sem_cobertura_vira_lacuna_da_equipe(self):
        """RF08: lacuna e da composicao, nao da proposta."""
        self.rodar()

        lacunas = LacunaCompetenciaEquipe.objects.all()

        self.assertEqual(
            [lacuna.competencia_necessaria_id for lacuna in lacunas],
            [self.desejavel.id_competencia_necessaria],
        )

    def test_rede_sem_ninguem_e_conflito_explicado(self):
        """`CONTEXT.md` secao 4: o matching opera somente sobre a rede interna."""
        self.especialista.delete()
        self.alheio.delete()

        resposta = self.client.post(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'rede_vazia')

    def test_sem_competencia_derivada_e_conflito_explicado(self):
        """A entrada do matching e a competencia necessaria, nao o texto livre."""
        CompetenciaNecessaria.objects.all().delete()

        resposta = self.client.post(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'sem_competencias')

    def test_rodada_deixa_evento_na_trilha(self):
        self.rodar()

        evento = EventoAuditoria.objects.get(
            categoria=CategoriaEvento.MATCHING, tipo='execucao'
        )

        self.assertEqual(evento.detalhe['candidatos'], 2)
        self.assertFalse(evento.detalhe['semantico_disponivel'])

    def test_nova_rodada_nao_apaga_a_anterior(self):
        """Cada execucao e uma composicao; a anterior continua legivel."""
        self.rodar()
        self.rodar()

        self.assertEqual(EquipePotencial.objects.count(), 2)
        self.assertEqual(ExecucaoMatching.objects.count(), 2)

    @override_settings(AI_MATCH_RERANK_ENABLED=True, AI_MATCH_MIN_SCORE=0.0)
    def test_rerank_reordena_sem_trocar_o_score_do_motor(self):
        """O numero da tela continua sendo o dos pesos ratificados."""
        duble = ProvedorFake(
            matches={
                'matches': [
                    {'candidato_index': 1, 'match_reasons': ['Perfil mais aderente']},
                    {'candidato_index': 0, 'match_reasons': []},
                ]
            }
        )

        resultado = ExecutarMatchingService(provedor=duble).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

        execucao = resultado['execucao']
        membros = list(resultado['equipe'].membros.all())

        self.assertTrue(execucao.usou_rerank)
        self.assertEqual(len(membros), 2)
        self.assertTrue(
            any('Segundo a IA' in ' '.join(membro.match_reasons) for membro in membros)
        )


class AjusteDaEquipeTests(MatchingBaseTests):
    def setUp(self):
        super().setUp()
        self.equipe = self.rodar()['equipe']
        self.indicacao = self.equipe.membros.first()

    def test_supervisor_tira_alguem_da_composicao_sem_apagar_a_indicacao(self):
        """RF08: a rodada que indicou continua legivel depois do ajuste."""
        resposta = self.client.patch(
            self.url('equipe-membro', self.indicacao.id_membro_equipe),
            {'incluido': False},
            format='json',
        )

        self.indicacao.refresh_from_db()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertFalse(self.indicacao.incluido)
        self.assertEqual(self.indicacao.ajustado_por_id, self.supervisor.pk)

    def test_supervisor_inclui_alguem_a_mao(self):
        """PB47: o ajuste manual e parte do requisito."""
        novo = MembroRedeBuilder().pesquisador().chamado('Clara Nunes').build()

        resposta = self.client.post(
            self.url('equipe-membros'),
            {'id_membro': novo.id_membro, 'papel': PapelNaRede.PESQUISADOR},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resposta.data['origem'], OrigemIndicacao.MANUAL)
        self.assertIsNone(resposta.data['score_compatibilidade'])

    def test_mesma_pessoa_duas_vezes_e_conflito(self):
        resposta = self.client.post(
            self.url('equipe-membros'),
            {
                'id_membro': self.indicacao.membro_id,
                'papel': PapelNaRede.PESQUISADOR,
            },
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'membro_duplicado')

    def test_validacao_marca_a_composicao_revisada(self):
        """D07: validar registra a revisao humana - nao convoca ninguem."""
        resposta = self.client.post(self.url('equipe-validar'))

        self.indicacao.refresh_from_db()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertTrue(self.indicacao.validada)

    def test_equipe_vazia_nao_se_valida(self):
        self.equipe.membros.update(incluido=False)

        resposta = self.client.post(self.url('equipe-validar'))

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'equipe_vazia')

    def test_contrato_nao_tem_aceite_nem_recusa(self):
        """RN-A06 / D07: nao existe convite - nem campo onde gravar um."""
        resposta = self.client.get(self.url())

        campos = set(resposta.data['membros'][0])

        self.assertEqual(campos & {'aceite', 'aceito', 'recusa', 'convite'}, set())


class AcessoAEquipeTests(MatchingBaseTests):
    def test_pesquisador_le_mas_nao_roda_matching(self):
        """D02 / RN-A06: ele acompanha, nao conduz nem aceita."""
        self.rodar()
        indicar_na_equipe(
            self.oportunidade,
            MembroRedeBuilder().pesquisador().com_acesso(self.pesquisador).build(),
        )
        self.como(self.pesquisador)

        self.assertEqual(self.client.get(self.url()).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post(self.url()).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_demandante_nao_ve_equipe(self):
        """PB71: resultado de matching e informacao interna."""
        self.rodar()
        self.como(self.demandante)

        self.assertEqual(
            self.client.get(self.url()).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_sem_matching_a_leitura_responde_404_explicado(self):
        resposta = self.client.get(self.url())

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resposta.data['codigo'], 'equipe_inexistente')


class ChamadaForaDaTransacaoTests(MatchingBaseTests):
    """A espera pelo rerank nao segura conexao nem bloqueio do banco."""

    @override_settings(AI_MATCH_RERANK_ENABLED=True, AI_MATCH_MIN_SCORE=0.0)
    def test_o_rerank_e_chamado_fora_de_transacao_aberta_pelo_caso_de_uso(self):
        provedor = ProvedorQueObservaATransacao()
        antes = len(connection.atomic_blocks)

        ExecutarMatchingService(provedor=provedor).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

        self.assertEqual(provedor.profundidades, [antes])
