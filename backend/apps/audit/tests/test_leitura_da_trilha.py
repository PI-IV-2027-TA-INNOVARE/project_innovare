"""
A trilha como o Administrador a le.

A linha guardava o que o banco sabe - `usuario 12`, `competencia_necessaria 8`,
`criterios_importados` - e a tela repetia isso. Quem le o console nao tem como
traduzir um id interno, entao a traducao e do servidor: rotulo do evento, alvo
legivel e o nome de quem agiu.

Login e logout bem-sucedidos sao a maior parte da trilha e diluem o que
aconteceu no fluxo. Ficam atras do filtro "Conta e acesso"; login recusado
continua aparecendo, porque e sinal de seguranca, nao rotina.
"""
import ast
from pathlib import Path

from django.conf import settings
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APIClient

from apps.audit.models import CategoriaEvento, StatusEvento
from apps.audit.rotulos import TIPOS_DINAMICOS, rotulo_do_tipo
from apps.audit.services import registrar_evento
from apps.competencies.models import CompetenciaNecessaria
from apps.copilot.models import PropostaEstruturada
from core.tests.builders import OportunidadeBuilder, UsuarioBuilder


class LeituraBaseTests(TestCase):
    url = reverse('trilha-list')

    def setUp(self):
        self.client = APIClient()
        self.administrador = (
            UsuarioBuilder().administrador().chamado('Console').build()
        )
        self.supervisor = (
            UsuarioBuilder().supervisor().chamado('Rafael Antunes').build()
        )
        self.client.force_authenticate(user=self.administrador)

    def evento(self, **campos):
        base = {
            'categoria': CategoriaEvento.OPORTUNIDADE,
            'tipo': 'oportunidade_cadastrada',
            'entidade': 'oportunidade',
            'entidade_id': 'OP-2026-001',
            'ator': self.supervisor.email,
        }
        base.update(campos)
        return registrar_evento(**base)

    def linhas(self, **filtros):
        resposta = self.client.get(self.url, filtros)
        self.assertEqual(resposta.status_code, 200, resposta.data)
        return resposta.data['results']

    def linha(self, **filtros):
        linhas = self.linhas(**filtros)
        self.assertEqual(len(linhas), 1)
        return linhas[0]


class LoginELogoutAtrasDoFiltroTests(LeituraBaseTests):
    def setUp(self):
        super().setUp()
        conta = {
            'categoria': CategoriaEvento.CONTA,
            'entidade': 'usuario',
            'entidade_id': str(self.supervisor.id_usuario),
        }
        self.evento(**conta, tipo='login')
        self.evento(**conta, tipo='logout')
        self.evento(
            **conta, tipo='login_recusado', status=StatusEvento.NEGADO
        )
        self.evento()

    def tipos(self, **filtros):
        return {linha['tipo'] for linha in self.linhas(**filtros)}

    def test_sem_filtro_login_e_logout_nao_aparecem(self):
        self.assertEqual(
            self.tipos(), {'login_recusado', 'oportunidade_cadastrada'}
        )

    def test_no_filtro_conta_e_acesso_aparecem(self):
        self.assertEqual(
            self.tipos(categoria='conta'), {'login', 'logout', 'login_recusado'}
        )

    def test_o_catalogo_avisa_onde_eles_estao(self):
        resposta = self.client.get(reverse('trilha-filtros'))

        self.assertEqual(resposta.data['rotina_oculta']['categoria'], 'conta')
        self.assertEqual(
            set(resposta.data['rotina_oculta']['tipos']), {'login', 'logout'}
        )


class RotuloDoEventoTests(LeituraBaseTests):
    def test_o_evento_chega_com_rotulo_legivel(self):
        self.evento(tipo='criterios_importados', entidade='criterio_referencia_pipe', entidade_id='V2')

        self.assertEqual(self.linha()['tipo_rotulo'], 'Critérios PIPE importados')

    def test_execucao_e_rotulada_pelo_que_foi_executado(self):
        self.assertEqual(rotulo_do_tipo('execucao', 'equipe_potencial'), 'Matching executado')
        self.assertEqual(
            rotulo_do_tipo('execucao', 'pre_analise_maturidade'), 'Pré-análise executada'
        )

    def test_decisao_tem_rotulo_por_desfecho(self):
        self.assertEqual(rotulo_do_tipo('decisao_arquivar', 'oportunidade'), 'Decisão: Arquivar')

    def test_tipo_sem_rotulo_aparece_cru_em_vez_de_sumir(self):
        self.assertEqual(rotulo_do_tipo('algo_novo', 'oportunidade'), 'algo_novo')

    def test_categoria_e_situacao_chegam_acentuadas(self):
        self.evento(categoria=CategoriaEvento.PREANALISE, tipo='criterios_importados')

        linha = self.linha()

        self.assertEqual(linha['categoria_rotulo'], 'Pré-análise')
        self.assertEqual(linha['status_rotulo'], 'Concluído')


class CatalogoCompletoTests(TestCase):
    """
    Todo tipo que o codigo grava tem rotulo.

    Le as chamadas de `registrar_evento` no fonte, em vez de manter uma lista
    paralela: tipo novo sem rotulo aparece cru na tela, e e este teste que
    avisa antes de alguem ver.
    """

    def _tipos_gravados(self):
        raiz = Path(settings.BASE_DIR)
        encontrados = set()

        for arquivo in (raiz / 'apps').rglob('*.py'):
            if 'tests' in arquivo.parts or 'migrations' in arquivo.parts:
                continue

            arvore = ast.parse(arquivo.read_text(encoding='utf-8'))
            constantes = {
                alvo.id: no.value.value
                for no in arvore.body
                if isinstance(no, ast.Assign) and isinstance(no.value, ast.Constant)
                for alvo in no.targets
                if isinstance(alvo, ast.Name)
            }

            for no in ast.walk(arvore):
                if not (
                    isinstance(no, ast.Call)
                    and getattr(no.func, 'id', getattr(no.func, 'attr', '')) == 'registrar_evento'
                ):
                    continue

                argumentos = {kw.arg: kw.value for kw in no.keywords}
                entidade = getattr(argumentos.get('entidade'), 'value', '')
                encontrados.update(
                    (tipo, entidade)
                    for tipo in self._valores(argumentos.get('tipo'), constantes)
                )

        return encontrados

    def _valores(self, no, constantes):
        if isinstance(no, ast.Constant):
            return [no.value]
        if isinstance(no, ast.IfExp):
            return self._valores(no.body, constantes) + self._valores(no.orelse, constantes)
        if isinstance(no, ast.Name) and no.id in constantes:
            return [constantes[no.id]]
        return []

    def test_todo_tipo_gravado_pelo_codigo_tem_rotulo(self):
        gravados = self._tipos_gravados()

        self.assertGreater(len(gravados), 30)
        sem_rotulo = sorted(
            f'{tipo} ({entidade})'
            for tipo, entidade in gravados
            if rotulo_do_tipo(tipo, entidade) == tipo
        )
        self.assertEqual(sem_rotulo, [])

    def test_os_tipos_montados_em_tempo_de_execucao_tambem(self):
        for tipo, entidade in TIPOS_DINAMICOS:
            self.assertNotEqual(rotulo_do_tipo(tipo, entidade), tipo)


class AlvoLegivelTests(LeituraBaseTests):
    def setUp(self):
        super().setUp()
        self.oportunidade = (
            OportunidadeBuilder()
            .interna()
            .intitulada('Detecção rápida de contaminação')
            .criada_por(self.supervisor)
            .build()
        )
        self.proposta = PropostaEstruturada.objects.create(oportunidade=self.oportunidade)

    def test_conta_de_outra_pessoa_mostra_nome_e_papel(self):
        self.evento(
            categoria=CategoriaEvento.CONTA,
            tipo='conta_atualizada',
            entidade='usuario',
            entidade_id=str(self.supervisor.id_usuario),
            ator=self.administrador.email,
        )

        alvo = self.linha()['alvo']

        self.assertEqual(alvo['rotulo'], 'Rafael Antunes (Supervisor)')
        self.assertFalse(alvo['removido'])

    def test_quando_a_pessoa_age_sobre_a_propria_conta_nao_repete_o_nome(self):
        self.evento(
            categoria=CategoriaEvento.CONTA,
            tipo='login',
            entidade='usuario',
            entidade_id=str(self.supervisor.id_usuario),
        )

        self.assertEqual(self.linha(categoria='conta')['alvo']['rotulo'], 'A própria conta')

    def test_competencia_mostra_a_descricao_e_a_oportunidade(self):
        competencia = CompetenciaNecessaria.objects.create(
            proposta=self.proposta, descricao='PCR em tempo real'
        )
        self.evento(
            categoria=CategoriaEvento.COMPETENCIA,
            tipo='competencia_adicionada',
            entidade='competencia_necessaria',
            entidade_id=competencia.pk,
            oportunidade=self.oportunidade,
        )

        alvo = self.linha()['alvo']

        self.assertEqual(alvo['rotulo'], 'Competência “PCR em tempo real”')
        self.assertEqual(alvo['oportunidade'], self.oportunidade.codigo)

    def test_proposta_aponta_a_oportunidade(self):
        self.evento(
            categoria=CategoriaEvento.COPILOTO,
            tipo='proposta_atualizada',
            entidade='proposta_estruturada',
            entidade_id=self.proposta.pk,
            oportunidade=self.oportunidade,
        )

        alvo = self.linha()['alvo']

        self.assertEqual(alvo['rotulo'], 'Proposta estruturada')
        self.assertEqual(alvo['oportunidade'], self.oportunidade.codigo)

    def test_oportunidade_mostra_codigo_e_titulo(self):
        self.evento(entidade_id=self.oportunidade.codigo, oportunidade=self.oportunidade)

        alvo = self.linha()['alvo']

        self.assertEqual(alvo['rotulo'], 'Detecção rápida de contaminação')
        self.assertEqual(alvo['oportunidade'], self.oportunidade.codigo)

    def test_criterios_mostram_a_versao(self):
        self.evento(
            categoria=CategoriaEvento.PREANALISE,
            tipo='criterios_importados',
            entidade='criterio_referencia_pipe',
            entidade_id='V2',
        )

        self.assertEqual(self.linha()['alvo']['rotulo'], 'Critérios PIPE, versão V2')

    def test_teto_mensal_de_ia(self):
        self.evento(
            categoria=CategoriaEvento.CONFIG,
            tipo='teto_de_custo_excedido',
            entidade='ia',
            entidade_id='custo_mensal',
        )

        self.assertEqual(self.linha()['alvo']['rotulo'], 'Orçamento mensal de IA')

    def test_registro_que_nao_existe_mais_e_dito_e_nao_escondido(self):
        self.evento(
            categoria=CategoriaEvento.COMPETENCIA,
            tipo='competencia_removida',
            entidade='competencia_necessaria',
            entidade_id='999',
        )

        alvo = self.linha()['alvo']

        self.assertTrue(alvo['removido'])
        self.assertIn('999', alvo['rotulo'])


class QuemAgiuTests(LeituraBaseTests):
    def test_o_ator_chega_com_nome(self):
        self.evento()

        linha = self.linha()

        self.assertEqual(linha['ator_nome'], 'Rafael Antunes')
        self.assertEqual(linha['ator'], self.supervisor.email)

    def test_o_sistema_e_dito_sistema(self):
        self.evento(ator='__sistema__')

        self.assertEqual(self.linha()['ator_nome'], 'Sistema')

    def test_ator_sem_conta_fica_com_o_identificador_gravado(self):
        self.evento(ator='antigo@ac2microbiologia.com.br')

        self.assertEqual(self.linha()['ator_nome'], 'antigo@ac2microbiologia.com.br')


class CustoDaLeituraTests(LeituraBaseTests):
    """Resolver os alvos custa o mesmo para 2 ou 20 linhas na pagina."""

    def _popular(self, quantidade):
        for indice in range(quantidade):
            oportunidade = OportunidadeBuilder().interna().criada_por(self.supervisor).build()
            proposta = PropostaEstruturada.objects.create(oportunidade=oportunidade)
            competencia = CompetenciaNecessaria.objects.create(
                proposta=proposta, descricao=f'Competencia {indice}'
            )
            self.evento(
                categoria=CategoriaEvento.COMPETENCIA,
                tipo='competencia_adicionada',
                entidade='competencia_necessaria',
                entidade_id=competencia.pk,
                oportunidade=oportunidade,
            )
            self.evento(
                categoria=CategoriaEvento.CONTA,
                tipo='conta_atualizada',
                entidade='usuario',
                entidade_id=str(self.supervisor.id_usuario),
                ator=self.administrador.email,
            )

    def _consultas(self):
        with CaptureQueriesContext(connection) as consultas:
            self.linhas()
        return len(consultas)

    def test_numero_de_consultas_nao_cresce_com_a_pagina(self):
        self._popular(1)
        poucas = self._consultas()

        self._popular(9)
        muitas = self._consultas()

        self.assertEqual(poucas, muitas)


class BuscaPeloQueATelaMostraTests(LeituraBaseTests):
    """A busca acha o evento pelo nome que a tela mostra, nao so pelo e-mail."""

    def setUp(self):
        super().setUp()
        self.oportunidade = (
            OportunidadeBuilder()
            .interna()
            .intitulada('Biofilme em trocador de calor')
            .criada_por(self.supervisor)
            .build()
        )
        self.evento(entidade_id=self.oportunidade.codigo, oportunidade=self.oportunidade)
        self.evento(ator=self.administrador.email, tipo='criterios_importados',
                    entidade='criterio_referencia_pipe', entidade_id='V2')

    def test_busca_pelo_nome_de_quem_agiu(self):
        self.assertEqual(self.linha(busca='Rafael')['tipo'], 'oportunidade_cadastrada')

    def test_busca_pelo_titulo_e_pelo_codigo_da_oportunidade(self):
        self.assertEqual(self.linha(busca='biofilme')['tipo'], 'oportunidade_cadastrada')
        self.assertEqual(
            self.linha(busca=self.oportunidade.codigo)['tipo'], 'oportunidade_cadastrada'
        )


class ConfiguracaoNaTrilhaTests(LeituraBaseTests):
    def test_alteracao_do_tema_aparece_como_aparencia_da_plataforma(self):
        self.evento(
            categoria=CategoriaEvento.CONFIG,
            tipo='configuracao_alterada',
            entidade='configuracao',
            entidade_id='tema',
            ator=self.administrador.email,
        )

        linha = self.linha()

        self.assertEqual(linha['tipo_rotulo'], 'Configuração alterada')
        self.assertEqual(linha['alvo']['rotulo'], 'Aparência da plataforma')
