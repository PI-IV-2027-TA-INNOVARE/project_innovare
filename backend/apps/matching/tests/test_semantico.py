"""
A parcela "Afinidade com o tema" do matching (45% da nota).

Ela compara o sentido das competencias necessarias com o perfil, mesmo com
palavras diferentes. O vetor de cada perfil e de cada competencia fica gravado,
com o modelo e a data, e e refeito quando o texto de origem muda.

Nenhum teste carrega o modelo de verdade: o provedor e um duble com vetores
fixos (AGENTS.md 0.1).
"""
import hashlib
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase, override_settings

from apps.ai.models import ExecucaoIA, TipoExecucaoIA
from apps.competencies.models import CompetenciaNecessaria, NivelImportancia
from apps.copilot.models import PropostaEstruturada
from apps.matching.models import VetorCompetenciaNecessaria, VetorMembro
from apps.matching.services import ExecutarMatchingService
from apps.matching.services.motor import EmbeddingIndisponivel, MotorDeMatching, candidato_de
from apps.matching.services.semantica import (
    BaseSemantica,
    provedor_de_embedding,
    texto_do_perfil,
)
from apps.network.models import Competencia, Formacao, MembroRede, TipoCompetencia
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    UsuarioBuilder,
    titulacao,
)

DIMENSAO = 16


class EmbeddingFake:
    """Vetor por saco de palavras: textos com as mesmas palavras ficam proximos."""

    modelo = 'duble-minilm'

    def __init__(self, falha=False):
        self.textos_vetorizados: list[str] = []
        self._falha = falha

    @property
    def disponivel(self) -> bool:
        return True

    def vetores(self, textos):
        if self._falha:
            raise RuntimeError('modelo fora do ar')

        self.textos_vetorizados.extend(textos)
        return [self._vetor(texto) for texto in textos]

    def _vetor(self, texto):
        vetor = [0.0] * DIMENSAO

        for palavra in texto.lower().split():
            indice = int(hashlib.md5(palavra.encode()).hexdigest(), 16) % DIMENSAO
            vetor[indice] += 1.0

        return vetor


class BaseSemanticaTests(TestCase):
    def setUp(self):
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.oportunidade = OportunidadeBuilder().interna().criada_por(self.supervisor).build()
        self.proposta = PropostaEstruturada.objects.create(
            oportunidade=self.oportunidade,
            problema_pesquisa='Contaminação na linha de envase.',
            objetivo_geral='Detectar a contaminação em 48 horas.',
            metodologia='PCR quantitativo e cultivo seletivo.',
        )
        self.necessaria = CompetenciaNecessaria.objects.create(
            proposta=self.proposta,
            descricao='Microbiologia de alimentos',
            nivel_importancia=NivelImportancia.ESSENCIAL,
        )
        self.marina = (
            MembroRedeBuilder()
            .pesquisador()
            .chamado('Marina Alves')
            .com_competencia('Microbiologia de alimentos')
            .com_experiencia('Dez anos em microbiologia de alimentos.')
            .integral()
            .build()
        )
        self.bruno = (
            MembroRedeBuilder()
            .pesquisador()
            .chamado('Bruno Dias')
            .com_competencia('Projeto de embalagens')
            .integral()
            .build()
        )
        self.fake = EmbeddingFake()

    def rodar(self, provedor=None):
        motor = MotorDeMatching(BaseSemantica(provedor or self.fake))

        with override_settings(AI_MATCH_MIN_SCORE=0.0):
            return ExecutarMatchingService(motor=motor).execute(
                oportunidade=self.oportunidade, ator=self.supervisor
            )


class RodadaComAfinidadeTests(BaseSemanticaTests):
    def test_a_parcela_entra_na_nota_e_a_rodada_nao_cai_no_caminho_reduzido(self):
        resultado = self.rodar()

        execucao = resultado['execucao']
        membros = list(resultado['equipe'].membros.all())

        self.assertFalse(execucao.fallback_usado)
        self.assertTrue(all(membro.score_features['semantico'] is not None for membro in membros))
        self.assertTrue(execucao.pesos['semantico_disponivel'])
        self.assertEqual(execucao.pesos['modelo_semantico'], 'duble-minilm')

    def test_quem_tem_o_tema_fica_a_frente(self):
        resultado = self.rodar()

        membros = list(resultado['equipe'].membros.order_by('-score_compatibilidade'))
        self.assertEqual(membros[0].membro_id, self.marina.id_membro)

    def test_o_motivo_mostra_a_afinidade_em_linguagem_de_tela(self):
        resultado = self.rodar()

        motivos = ' '.join(resultado['equipe'].membros.get(membro=self.marina).match_reasons)
        self.assertIn('Afinidade com o tema da oportunidade', motivos)
        self.assertNotIn('semântica', motivos)

    def test_modelo_fora_do_ar_a_rodada_sai_pelas_outras_tres_parcelas(self):
        resultado = self.rodar(provedor=EmbeddingFake(falha=True))

        execucao = resultado['execucao']
        membro = resultado['equipe'].membros.get(membro=self.marina)

        self.assertTrue(execucao.fallback_usado)
        self.assertIsNone(membro.score_features['semantico'])
        self.assertIn('Afinidade com o tema indisponível', ' '.join(membro.match_reasons))


class VetoresGravadosTests(BaseSemanticaTests):
    def test_os_vetores_ficam_gravados_com_o_modelo_e_a_data(self):
        self.rodar()

        vetor = VetorMembro.objects.get(membro=self.marina)
        self.assertEqual(vetor.modelo, 'duble-minilm')
        self.assertEqual(vetor.dimensao, DIMENSAO)
        self.assertEqual(len(vetor.vetor), DIMENSAO)
        self.assertIsNotNone(vetor.gerado_em)
        self.assertTrue(
            VetorCompetenciaNecessaria.objects.filter(
                competencia_necessaria=self.necessaria
            ).exists()
        )

    def test_o_tamanho_sai_do_proprio_vetor_e_nao_de_uma_coluna(self):
        """Guardar o tamanho a parte deixaria os dois divergirem (3FN)."""
        for modelo in (VetorMembro, VetorCompetenciaNecessaria):
            colunas = [campo.column for campo in modelo._meta.concrete_fields]

            self.assertNotIn('dimensao', colunas)
            self.assertEqual(modelo(vetor=[0.1, 0.2, 0.3]).dimensao, 3)

    def test_sem_mudanca_o_vetor_nao_e_refeito(self):
        self.rodar()
        self.fake.textos_vetorizados.clear()

        self.rodar()

        self.assertEqual(self.fake.textos_vetorizados, [])

    def test_o_vetor_e_refeito_quando_o_perfil_muda(self):
        self.rodar()
        antes = VetorMembro.objects.get(membro=self.marina).texto_hash
        self.fake.textos_vetorizados.clear()

        MembroRede.objects.filter(pk=self.marina.pk).update(
            experiencia='Doze anos em microbiologia de laticínios.'
        )
        self.rodar()

        self.assertEqual(len(self.fake.textos_vetorizados), 1)
        self.assertNotEqual(VetorMembro.objects.get(membro=self.marina).texto_hash, antes)

    def test_a_geracao_fica_registrada_como_execucao_de_ia(self):
        self.rodar()

        execucao = ExecucaoIA.objects.get(tipo=TipoExecucaoIA.EMBEDDING)
        self.assertEqual(execucao.modelo, 'duble-minilm')
        self.assertIsNone(execucao.custo_estimado)


class TextoDoPerfilTests(BaseSemanticaTests):
    def test_a_formacao_entra_no_texto_que_vira_vetor(self):
        Formacao.objects.create(
            membro=self.marina,
            curso='Engenharia de Alimentos',
            instituicao='Universidade Estadual',
            titulacao=titulacao('doutorado'),
        )
        membro = MembroRede.objects.prefetch_related(
            'vinculos_competencia__competencia', 'formacoes__titulacao'
        ).get(pk=self.marina.pk)

        texto = texto_do_perfil(candidato_de(membro))

        self.assertIn('Engenharia de Alimentos', texto)
        self.assertIn('Doutorado', texto)

    def test_o_sinonimo_vira_o_termo_canonico_antes_do_vetor(self):
        canonica = Competencia.objects.create(
            nome='PCR quantitativo', tipo=TipoCompetencia.TECNICA, canonica=True
        )
        Competencia.objects.create(
            nome='qPCR', tipo=TipoCompetencia.TECNICA, sinonimo_de=canonica
        )
        membro = MembroRedeBuilder().pesquisador().com_tecnica('qPCR').build()

        texto = texto_do_perfil(candidato_de(membro))

        self.assertIn('PCR quantitativo', texto)
        self.assertNotIn('qPCR', texto)


class ProvedorDaSuiteTests(TestCase):
    def test_a_suite_nunca_carrega_o_modelo_de_verdade(self):
        self.assertIsInstance(provedor_de_embedding(), EmbeddingIndisponivel)


class ComandoGerarVetoresTests(BaseSemanticaTests):
    def test_gera_os_vetores_da_rede_inteira_de_uma_vez(self):
        with mock.patch(
            'apps.matching.management.commands.gerar_vetores.provedor_de_embedding',
            return_value=self.fake,
        ):
            call_command('gerar_vetores', stdout=StringIO())

        self.assertEqual(VetorMembro.objects.count(), 2)
        self.assertEqual(VetorCompetenciaNecessaria.objects.count(), 1)

    def test_sem_modelo_o_comando_explica_e_nao_grava_nada(self):
        saida = StringIO()

        call_command('gerar_vetores', stdout=saida)

        self.assertIn('desligada', saida.getvalue())
        self.assertFalse(VetorMembro.objects.exists())
