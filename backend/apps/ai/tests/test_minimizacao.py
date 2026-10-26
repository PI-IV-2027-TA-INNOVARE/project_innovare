"""
Nenhum nome nem e-mail de pessoa sai para o provedor de IA (LGPD, minimizacao).

A pre-analise e a reordenacao do matching recebem apelidos ("Pesquisador A") e o
sistema traduz de volta ao ler a resposta: a tela continua mostrando o nome
certo de cada pessoa.
"""
import json
import tempfile

from django.test import TestCase, override_settings

from apps.ai.services.apelidos import Apelidos
from apps.ai.services.base_conhecimento import base_conhecimento
from apps.competencies.models import CompetenciaNecessaria, NivelImportancia
from apps.copilot.models import Lacuna, PropostaEstruturada
from apps.matching.services import ExecutarMatchingService
from apps.maturity.services import ImportarCriteriosService, PreAnalisarService
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    UsuarioBuilder,
    indicar_na_equipe,
)
from core.tests.dubles import PREANALISE_PADRAO, ProvedorFake, escrever_base_pipe

PROPOSTA = {
    'problema_pesquisa': 'Contaminação resiste à pasteurização.',
    'objetivo_geral': 'Desenvolver protocolo de detecção rápida.',
    'metodologia': 'Cultivo seletivo e PCR em tempo real.',
}


class ApelidosTests(TestCase):
    def test_da_um_apelido_por_pessoa_na_ordem(self):
        apelidos = Apelidos(['Marina Alves', 'Bruno Dias'])

        self.assertEqual(apelidos.apelido('Marina Alves'), 'Pesquisador A')
        self.assertEqual(apelidos.apelido('Bruno Dias'), 'Pesquisador B')

    def test_troca_o_nome_no_texto_e_traduz_de_volta(self):
        apelidos = Apelidos(['Marina Alves'])

        anonimo = apelidos.anonimizar('Marina Alves coordenou o projeto; Marina publicou.')

        self.assertNotIn('Marina', anonimo)
        self.assertEqual(
            apelidos.restaurar('Pesquisador A tem a competência.'),
            'Marina Alves tem a competência.',
        )

    def test_tira_e_mail_telefone_e_endereco_e_deixa_os_anos(self):
        texto = Apelidos([]).anonimizar(
            'Contato: ana@lab.example, (11) 98765-4321, 11 3456-7890 e '
            'https://lattes.cnpq.br/123. Atuou de 2019-2023 no processo 2019/12345-6.'
        )

        self.assertNotIn('ana@', texto)
        self.assertNotIn('98765', texto)
        self.assertNotIn('3456-7890', texto)
        self.assertNotIn('lattes', texto)
        self.assertIn('2019-2023', texto)
        self.assertIn('2019/12345-6', texto)

    def test_apelido_longo_nao_e_confundido_com_o_curto(self):
        nomes = [f'Pessoa {indice}' for indice in range(28)]
        apelidos = Apelidos(nomes)

        self.assertEqual(apelidos.apelido('Pessoa 27'), 'Pesquisador AB')
        self.assertEqual(apelidos.restaurar('Pesquisador AB'), 'Pessoa 27')

    def test_restaura_em_qualquer_estrutura(self):
        apelidos = Apelidos(['Marina Alves'])

        restaurado = apelidos.restaurar_em(
            {'lista': ['Pesquisador A cobre'], 'texto': 'Sem Pesquisador A', 'n': 3}
        )

        self.assertEqual(
            restaurado,
            {'lista': ['Marina Alves cobre'], 'texto': 'Sem Marina Alves', 'n': 3},
        )


class MinimizacaoNaPreAnaliseTests(TestCase):
    def setUp(self):
        self.diretorio = tempfile.TemporaryDirectory()
        self.base = escrever_base_pipe(self.diretorio.name)
        base_conhecimento.cache_clear()

        administrador = UsuarioBuilder().administrador().build()
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.oportunidade = OportunidadeBuilder().interna().criada_por(self.supervisor).build()
        PropostaEstruturada.objects.create(oportunidade=self.oportunidade, **PROPOSTA)

        self.marina = (
            MembroRedeBuilder()
            .pesquisador()
            .chamado('Marina Alves')
            .com_email('marina.alves@ac2.example')
            .com_titulacao('doutorado')
            .build()
        )
        indicar_na_equipe(self.oportunidade, self.marina)

        with override_settings(BASE_CONHECIMENTO_PIPE=self.base):
            base_conhecimento.cache_clear()
            ImportarCriteriosService().execute(ator=administrador)

    def tearDown(self):
        base_conhecimento.cache_clear()
        self.diretorio.cleanup()

    def test_o_texto_que_chega_ao_provedor_nao_tem_nome_nem_email(self):
        provedor = ProvedorFake()

        PreAnalisarService(provedor=provedor).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

        pedido = json.dumps(provedor.pedidos['pre_analise_pipe'], default=str)
        self.assertNotIn('Marina', pedido)
        self.assertNotIn('marina.alves@', pedido)
        self.assertIn('Pesquisador A', pedido)

    def test_a_resposta_volta_com_o_nome_certo(self):
        resposta = json.loads(json.dumps(PREANALISE_PADRAO))
        resposta['lacunas'] = [
            {'dimensao': 'equipe_supervisao', 'descricao': 'Pesquisador A precisa de apoio.'}
        ]

        PreAnalisarService(provedor=ProvedorFake(preanalise=resposta)).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

        lacuna = Lacuna.objects.get(campo_afetado='equipe_supervisao')
        self.assertEqual(lacuna.descricao, 'Marina Alves precisa de apoio.')


@override_settings(AI_MATCH_RERANK_ENABLED=True, AI_MATCH_MIN_SCORE=0.0)
class MinimizacaoNoMatchingTests(TestCase):
    def setUp(self):
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.oportunidade = OportunidadeBuilder().interna().criada_por(self.supervisor).build()
        proposta = PropostaEstruturada.objects.create(
            oportunidade=self.oportunidade, **PROPOSTA
        )
        CompetenciaNecessaria.objects.create(
            proposta=proposta,
            descricao='Microbiologia de alimentos',
            nivel_importancia=NivelImportancia.ESSENCIAL,
        )

        MembroRedeBuilder().pesquisador().chamado('Marina Alves').com_email(
            'marina.alves@ac2.example'
        ).com_competencia('Microbiologia de alimentos').com_experiencia(
            'Marina Alves coordenou dez projetos de microbiologia.'
        ).integral().build()

    def test_o_texto_que_chega_ao_provedor_nao_tem_nome_nem_email(self):
        provedor = ProvedorFake(
            matches={'matches': [{'candidato_index': 0, 'match_reasons': []}]}
        )

        ExecutarMatchingService(provedor=provedor).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

        pedido = json.dumps(provedor.pedidos['executar_matching'], default=str)
        self.assertNotIn('Marina', pedido)
        self.assertNotIn('marina.alves@', pedido)
        self.assertIn('Pesquisador A', pedido)

    def test_o_motivo_da_ia_volta_com_o_nome_certo(self):
        provedor = ProvedorFake(
            matches={
                'matches': [
                    {
                        'candidato_index': 0,
                        'match_reasons': ['Pesquisador A domina a técnica pedida.'],
                    }
                ]
            }
        )

        resultado = ExecutarMatchingService(provedor=provedor).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

        motivos = ' '.join(resultado['equipe'].membros.get().match_reasons)
        self.assertIn('Marina Alves domina a técnica pedida.', motivos)
        self.assertNotIn('Pesquisador A', motivos)
