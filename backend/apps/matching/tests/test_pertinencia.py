"""
Testes da medicao de pertinencia do matching (SPEC-16, P5 / IA 15).

A pertinencia e a parte das sugestoes da equipe potencial que a AC2 marcou
como pertinente. A meta do TAP e 80%. A medicao le a rede e as competencias,
roda o mesmo motor da tela e nao grava nada: nem equipe, nem execucao, nem
trilha.
"""
import json
import tempfile
from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.audit.models import EventoAuditoria
from apps.competencies.models import CompetenciaNecessaria, NivelImportancia
from apps.copilot.models import PropostaEstruturada
from apps.matching.models import EquipePotencial, ExecucaoMatching
from apps.matching.services.pertinencia import MedirPertinenciaService
from core.exceptions import ConflitoDeEstado
from core.tests.builders import MembroRedeBuilder, OportunidadeBuilder, UsuarioBuilder


class PertinenciaBaseTests(TestCase):
    def setUp(self):
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.oportunidade = self.oportunidade_com('Microbiologia de alimentos')

        self.pertinente = self.pesquisador('Marina Alves', 'Microbiologia de alimentos')
        self.nao_pertinente = self.pesquisador('Clara Nunes', 'Microbiologia de alimentos')
        self.alheio = self.pesquisador('Bruno Dias', 'Projeto de embalagens')

    def oportunidade_com(self, competencia):
        oportunidade = OportunidadeBuilder().interna().criada_por(self.supervisor).build()
        proposta = PropostaEstruturada.objects.create(
            oportunidade=oportunidade,
            revisada_por_humano=True,
            problema_pesquisa='Contaminacao na linha de envase.',
        )
        CompetenciaNecessaria.objects.create(
            proposta=proposta,
            descricao=competencia,
            nivel_importancia=NivelImportancia.ESSENCIAL,
        )
        return oportunidade

    def pesquisador(self, nome, competencia):
        return (
            MembroRedeBuilder()
            .pesquisador()
            .chamado(nome)
            .com_titulacao('doutorado')
            .integral()
            .com_competencia(competencia)
            .build()
        )

    def amostra(self, *casos):
        return {
            'descricao': 'Amostra ficticia de teste.',
            'casos': [
                {'oportunidade': oportunidade.codigo, 'pertinentes': [m.id_membro for m in membros]}
                for oportunidade, membros in casos
            ],
        }

    def medir(self, amostra, **kwargs):
        return MedirPertinenciaService().execute(amostra=amostra, **kwargs)


class MedicaoTests(PertinenciaBaseTests):
    def test_mede_a_parte_das_sugestoes_marcadas_como_pertinentes(self):
        resultado = self.medir(self.amostra((self.oportunidade, [self.pertinente])))

        caso = resultado.casos[0]
        self.assertEqual(caso.codigo, self.oportunidade.codigo)
        self.assertEqual(caso.sugeridos, 2)
        self.assertEqual(caso.pertinentes_sugeridos, 1)
        self.assertEqual(caso.pertinencia, 0.5)

    def test_o_total_soma_as_sugestoes_de_todos_os_casos(self):
        outra = self.oportunidade_com('Microbiologia de alimentos')

        resultado = self.medir(
            self.amostra(
                (self.oportunidade, [self.pertinente]),
                (outra, [self.pertinente, self.nao_pertinente]),
            )
        )

        self.assertEqual(resultado.sugeridos, 4)
        self.assertEqual(resultado.pertinentes_sugeridos, 3)
        self.assertEqual(resultado.pertinencia, 0.75)
        self.assertFalse(resultado.atingiu_a_meta)

    def test_duas_execucoes_dao_o_mesmo_numero(self):
        amostra = self.amostra((self.oportunidade, [self.pertinente]))

        self.assertEqual(self.medir(amostra).pertinencia, self.medir(amostra).pertinencia)

    def test_a_medicao_nao_grava_equipe_execucao_nem_trilha(self):
        eventos = EventoAuditoria.objects.count()

        self.medir(self.amostra((self.oportunidade, [self.pertinente])))

        self.assertFalse(EquipePotencial.objects.exists())
        self.assertFalse(ExecucaoMatching.objects.exists())
        self.assertEqual(EventoAuditoria.objects.count(), eventos)

    def test_sem_afinidade_declara_o_calculo_reduzido(self):
        resultado = self.medir(
            self.amostra((self.oportunidade, [self.pertinente])), sem_afinidade=True
        )

        self.assertFalse(resultado.com_afinidade)


class AmostraInvalidaTests(PertinenciaBaseTests):
    def test_oportunidade_que_nao_existe_e_recusada_pelo_codigo(self):
        amostra = {'casos': [{'oportunidade': 'OP-1999-999', 'pertinentes': []}]}

        with self.assertRaisesMessage(ConflitoDeEstado, 'OP-1999-999'):
            self.medir(amostra)

    def test_pessoa_fora_da_rede_e_recusada_pelo_numero(self):
        amostra = {'casos': [{'oportunidade': self.oportunidade.codigo, 'pertinentes': [987654]}]}

        with self.assertRaisesMessage(ConflitoDeEstado, '987654'):
            self.medir(amostra)

    def test_oportunidade_sem_competencias_e_recusada(self):
        sem_competencia = OportunidadeBuilder().interna().criada_por(self.supervisor).build()
        amostra = {'casos': [{'oportunidade': sem_competencia.codigo, 'pertinentes': []}]}

        with self.assertRaisesMessage(ConflitoDeEstado, sem_competencia.codigo):
            self.medir(amostra)

    def test_amostra_sem_casos_e_recusada(self):
        with self.assertRaises(ConflitoDeEstado):
            self.medir({'casos': []})


class ComandoTests(PertinenciaBaseTests):
    def rodar(self, amostra, *args):
        with tempfile.TemporaryDirectory() as pasta:
            caminho = Path(pasta) / 'amostra.json'
            caminho.write_text(json.dumps(amostra), encoding='utf-8')
            saida = StringIO()
            call_command('medir_pertinencia', str(caminho), *args, stdout=saida)
            return saida.getvalue()

    def test_mostra_cada_caso_e_o_total_contra_a_meta(self):
        saida = self.rodar(self.amostra((self.oportunidade, [self.pertinente])))

        self.assertIn(f'{self.oportunidade.codigo}: 1 de 2 sugestões pertinentes (50%)', saida)
        self.assertIn('Pertinência total: 1 de 2 sugestões (50%). Meta: 80%.', saida)

    def test_arquivo_que_nao_existe_e_erro_claro(self):
        with self.assertRaisesMessage(CommandError, 'nao_existe.json'):
            call_command('medir_pertinencia', 'nao_existe.json', stdout=StringIO())
