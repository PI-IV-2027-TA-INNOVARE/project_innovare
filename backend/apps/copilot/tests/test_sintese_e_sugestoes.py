"""
O Copiloto que entende a entrada e usa a resposta.

Tres mudancas que estes testes cobram:

- ao abrir a sessao, a IA resume a entrada - problema, contexto e o que falta -
  e o Supervisor corrige esse resumo antes de estruturar;
- a resposta a uma pergunta preenche o elemento vazio; em elemento ja escrito,
  vira sugestao que o Supervisor aceita ou deixa de lado;
- cada elemento sai avaliado como ausente, inconsistente ou pouco desenvolvido,
  com a recomendacao e, quando cabe, uma pergunta da IA.

O provedor e sempre duble: nenhum teste toca o Gemini (AGENTS.md 0.1).
"""
import tempfile
from unittest import mock

from django.db import connection
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.services.base_conhecimento import base_conhecimento
from apps.audit.models import EventoAuditoria
from apps.copilot.models import (
    AutorMensagem,
    Lacuna,
    MensagemCopiloto,
    NaturezaLacuna,
    PropostaEstruturada,
    Severidade,
    SessaoCopiloto,
    TipoLacuna,
)
from apps.copilot.services import EstruturarPropostaService, IniciarSessaoService
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    UsuarioBuilder,
    indicar_na_equipe,
)
from core.tests.dubles import (
    ProvedorFake,
    ProvedorIndisponivel,
    ProvedorQueObservaATransacao,
    escrever_base_pipe,
)

SINTESE = {
    'problema': 'Lotes de suco perdidos por contaminação.',
    'contexto': 'Linha de envase da AC2.',
    'o_que_falta': ['Volume perdido por mês', 'Método atual de detecção'],
}


def saida(preenchimentos=None, sugestoes=None, avaliacao=None):
    return {
        'preenchimentos': preenchimentos or {},
        'sugestoes': sugestoes or [],
        'avaliacao': avaliacao or [],
    }


class CopilotoV2Tests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.diretorio = tempfile.TemporaryDirectory()
        self.base = escrever_base_pipe(self.diretorio.name)
        self.override = override_settings(BASE_CONHECIMENTO_PIPE=self.base)
        self.override.enable()
        base_conhecimento.cache_clear()

        self.supervisor = UsuarioBuilder().supervisor().build()
        self.oportunidade = (
            OportunidadeBuilder()
            .interna()
            .intitulada('Detecção rápida de contaminação')
            .com_contexto('Perdas na linha de envase.', 'Resumo do caso.')
            .criada_por(self.supervisor)
            .build()
        )
        self.client.force_authenticate(self.supervisor)

    def tearDown(self):
        self.override.disable()
        base_conhecimento.cache_clear()
        self.diretorio.cleanup()

    def url(self, sufixo='copiloto'):
        return reverse(f'oportunidade-{sufixo}', args=[self.oportunidade.codigo])

    def iniciar(self, provedor=None):
        return IniciarSessaoService(provedor=provedor or ProvedorFake(sintese=SINTESE)).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

    def estruturar(self, provedor):
        return EstruturarPropostaService(provedor=provedor).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

    def proposta(self, **elementos):
        return PropostaEstruturada.objects.create(oportunidade=self.oportunidade, **elementos)


class SinteseDaEntradaTests(CopilotoV2Tests):
    def test_abrir_a_sessao_resume_a_entrada_e_guarda_o_resumo(self):
        provedor = ProvedorFake(sintese=SINTESE)

        sessao = self.iniciar(provedor)

        self.assertIn('Detecção rápida de contaminação', provedor.pedidos['sintetizar_entrada']['entrada'])
        self.assertEqual(
            sessao.sintese,
            'Problema: Lotes de suco perdidos por contaminação.\n'
            'Contexto: Linha de envase da AC2.\n'
            'O que falta:\n'
            '- Volume perdido por mês\n'
            '- Método atual de detecção',
        )
        abertura = sessao.mensagens.get(ordem=1)
        self.assertIn('corrija', abertura.conteudo)
        self.assertIsNotNone(abertura.execucao_ia)

    def test_sem_ia_a_sessao_abre_sem_resumo_e_diz_o_motivo(self):
        sessao = self.iniciar(ProvedorIndisponivel(motivo='limite_da_oportunidade'))

        self.assertEqual(sessao.sintese, '')
        self.assertIn('limite de gasto com IA', sessao.mensagens.get(ordem=1).conteudo)

    def test_o_resumo_e_pedido_fora_de_transacao(self):
        provedor = ProvedorQueObservaATransacao(sintese=SINTESE)
        antes = len(connection.atomic_blocks)

        self.iniciar(provedor)

        self.assertEqual(provedor.profundidades, [antes])

    def test_a_aba_mostra_o_resumo(self):
        self.iniciar()

        resposta = self.client.get(self.url())

        self.assertIn('Problema: Lotes de suco', resposta.data['sessao']['sintese'])

    def test_o_supervisor_corrige_o_resumo(self):
        self.iniciar()

        resposta = self.client.patch(
            self.url('copiloto-sintese'),
            {'sintese': 'Problema: perda de 4% dos lotes.'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['sintese'], 'Problema: perda de 4% dos lotes.')
        self.assertEqual(SessaoCopiloto.objects.get().sintese, 'Problema: perda de 4% dos lotes.')
        self.assertTrue(EventoAuditoria.objects.filter(tipo='sintese_revisada').exists())

    def test_o_pesquisador_le_mas_nao_corrige_o_resumo(self):
        self.iniciar()
        pesquisador = UsuarioBuilder().pesquisador().build()
        indicar_na_equipe(
            self.oportunidade, MembroRedeBuilder().pesquisador().com_acesso(pesquisador).build()
        )
        self.client.force_authenticate(pesquisador)

        resposta = self.client.patch(
            self.url('copiloto-sintese'), {'sintese': 'Outra.'}, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_corrigir_sem_sessao_responde_404_explicado(self):
        resposta = self.client.patch(
            self.url('copiloto-sintese'), {'sintese': 'Outra.'}, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resposta.data['codigo'], 'sessao_inexistente')


class RespostaLigadaAPerguntaTests(CopilotoV2Tests):
    def test_a_resposta_guarda_o_elemento_e_a_pergunta(self):
        self.iniciar()

        resposta = self.client.post(
            self.url('copiloto-responder'),
            {
                'texto': 'Controle positivo com cepa padrão.',
                'elemento': 'metodologia',
                'pergunta': 'Quais controles serão usados?',
            },
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            resposta.data['conteudo'],
            '[Metodologia] Quais controles serão usados?\nResposta: Controle positivo com cepa padrão.',
        )

    def test_elemento_desconhecido_e_recusado(self):
        self.iniciar()

        resposta = self.client.post(
            self.url('copiloto-responder'),
            {'texto': 'x', 'elemento': 'orcamento'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_estruturacao_recebe_o_resumo_as_respostas_e_o_que_ja_esta_escrito(self):
        self.proposta(metodologia='PCR em tempo real.')
        self.iniciar()
        self.client.post(
            self.url('copiloto-responder'),
            {'texto': 'Cepa padrão.', 'elemento': 'metodologia', 'pergunta': 'Quais controles?'},
            format='json',
        )
        provedor = ProvedorFake(proposta=saida())

        self.estruturar(provedor)

        pedido = provedor.pedidos['estruturar_proposta']
        self.assertIn('Problema: Lotes de suco', pedido['sintese'])
        self.assertEqual(pedido['respostas'], ['[Metodologia] Quais controles?\nResposta: Cepa padrão.'])
        self.assertEqual(pedido['preenchidos'], {'metodologia': 'PCR em tempo real.'})
        self.assertNotIn('metodologia', pedido['vazios'])
        self.assertIn('objetivo_geral', pedido['vazios'])


class PreenchimentoESugestaoTests(CopilotoV2Tests):
    def test_preenche_o_vazio_e_devolve_sugestao_para_o_ja_escrito(self):
        self.proposta(metodologia='PCR em tempo real.', revisada_por_humano=True)

        resultado = self.estruturar(ProvedorFake(proposta=saida(
            preenchimentos={'objetivo_geral': 'Detectar em 48 horas.', 'metodologia': 'Outra.'},
            sugestoes=[{
                'elemento': 'metodologia',
                'texto_sugerido': 'PCR em tempo real com controle positivo.',
                'motivo': 'A resposta trouxe o controle.',
            }],
        )))

        proposta = PropostaEstruturada.objects.get()
        self.assertEqual(proposta.objetivo_geral, 'Detectar em 48 horas.')
        self.assertEqual(proposta.metodologia, 'PCR em tempo real.')
        self.assertEqual(resultado['preenchidos'], ['objetivo_geral'])
        self.assertEqual(
            resultado['sugestoes'],
            [{
                'elemento': 'metodologia',
                'texto_sugerido': 'PCR em tempo real com controle positivo.',
                'motivo': 'A resposta trouxe o controle.',
            }],
        )

    def test_sugestao_para_elemento_vazio_ou_igual_ao_texto_e_descartada(self):
        self.proposta(metodologia='PCR em tempo real.')

        resultado = self.estruturar(ProvedorFake(proposta=saida(sugestoes=[
            {'elemento': 'hipotese', 'texto_sugerido': 'Uma hipótese.', 'motivo': ''},
            {'elemento': 'metodologia', 'texto_sugerido': 'PCR em tempo real.', 'motivo': ''},
        ])))

        self.assertEqual(resultado['sugestoes'], [])

    def test_a_api_devolve_a_sugestao_com_o_nome_do_elemento(self):
        self.proposta(metodologia='PCR em tempo real.')
        provedor = ProvedorFake(proposta=saida(sugestoes=[
            {'elemento': 'metodologia', 'texto_sugerido': 'Com controle.', 'motivo': 'Resposta nova.'},
        ]))

        with mock.patch(
            'apps.copilot.services.copiloto.EstruturarPropostaService._resolver_provedor',
            return_value=provedor,
        ):
            resposta = self.client.post(self.url('copiloto-estruturar'))

        sugestao = resposta.data['sugestoes'][0]
        self.assertEqual(sugestao['elemento'], 'metodologia')
        self.assertEqual(sugestao['elemento_rotulo'], 'Metodologia')
        self.assertEqual(sugestao['texto_sugerido'], 'Com controle.')

    def test_aceitar_a_sugestao_grava_o_elemento_sem_mudar_a_revisao(self):
        self.proposta(metodologia='PCR em tempo real.', revisada_por_humano=False)

        resposta = self.client.post(
            self.url('copiloto-aceitar-sugestao'),
            {'elemento': 'metodologia', 'texto': 'PCR com controle positivo.'},
            format='json',
        )

        proposta = PropostaEstruturada.objects.get()
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(proposta.metodologia, 'PCR com controle positivo.')
        self.assertFalse(proposta.revisada_por_humano)
        evento = EventoAuditoria.objects.get(tipo='sugestao_aceita')
        self.assertEqual(evento.detalhe, {'elemento': 'metodologia'})

    def test_sugestao_para_os_objetivos_vira_um_objetivo_por_linha(self):
        self.proposta(objetivos_especificos=['Isolar cepas'])

        self.client.post(
            self.url('copiloto-aceitar-sugestao'),
            {'elemento': 'objetivos_especificos', 'texto': 'Isolar cepas\n\nValidar o método'},
            format='json',
        )

        self.assertEqual(
            PropostaEstruturada.objects.get().objetivos_especificos,
            ['Isolar cepas', 'Validar o método'],
        )

    def test_o_pesquisador_nao_aceita_sugestao(self):
        self.proposta(metodologia='PCR.')
        pesquisador = UsuarioBuilder().pesquisador().build()
        indicar_na_equipe(
            self.oportunidade, MembroRedeBuilder().pesquisador().com_acesso(pesquisador).build()
        )
        self.client.force_authenticate(pesquisador)

        resposta = self.client.post(
            self.url('copiloto-aceitar-sugestao'),
            {'elemento': 'metodologia', 'texto': 'Outra.'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)


class AvaliacaoDosElementosTests(CopilotoV2Tests):
    def avaliar(self, situacao, **extra):
        return self.estruturar(ProvedorFake(proposta=saida(avaliacao=[{
            'elemento': 'metodologia',
            'situacao': situacao,
            'o_que_falta': 'Faltam os controles.',
            'recomendacao': 'Descreva o controle positivo e o negativo.',
            'pergunta': 'Quais controles serão usados?',
            **extra,
        }])))

    def lacuna_da_metodologia(self):
        return Lacuna.objects.get(
            tipo=TipoLacuna.PROPOSTA, campo_afetado='metodologia', resolvida=False
        )

    def test_elemento_pouco_desenvolvido_vira_lacuna_com_o_que_fazer(self):
        self.proposta(metodologia='PCR.')

        self.avaliar('pouco_desenvolvido')

        lacuna = self.lacuna_da_metodologia()
        self.assertEqual(lacuna.natureza, NaturezaLacuna.POUCO_DESENVOLVIDO)
        self.assertEqual(lacuna.descricao, 'Faltam os controles.')
        self.assertEqual(lacuna.recomendacao, 'Descreva o controle positivo e o negativo.')
        self.assertEqual(lacuna.pergunta, 'Quais controles serão usados?')
        self.assertEqual(lacuna.severidade, Severidade.MEDIA)

    def test_elemento_inconsistente_e_lacuna_alta(self):
        self.proposta(metodologia='PCR.')

        self.avaliar('inconsistente')

        lacuna = self.lacuna_da_metodologia()
        self.assertEqual(lacuna.natureza, NaturezaLacuna.INCONSISTENTE)
        self.assertEqual(lacuna.severidade, Severidade.ALTA)

    def test_elemento_adequado_fecha_a_lacuna(self):
        self.proposta(metodologia='PCR.')
        self.avaliar('pouco_desenvolvido')

        self.avaliar('adequado')

        self.assertFalse(
            Lacuna.objects.filter(campo_afetado='metodologia', resolvida=False).exists()
        )

    def test_nova_avaliacao_atualiza_a_mesma_lacuna(self):
        self.proposta(metodologia='PCR.')
        self.avaliar('pouco_desenvolvido')

        self.avaliar('inconsistente', o_que_falta='O método contradiz o objetivo.')

        lacuna = self.lacuna_da_metodologia()
        self.assertEqual(lacuna.natureza, NaturezaLacuna.INCONSISTENTE)
        self.assertEqual(lacuna.descricao, 'O método contradiz o objetivo.')
        self.assertEqual(Lacuna.objects.filter(campo_afetado='metodologia').count(), 1)

    def test_elemento_vazio_e_lacuna_ausente_com_a_recomendacao_da_ia(self):
        self.avaliar('ausente')

        lacuna = self.lacuna_da_metodologia()
        self.assertEqual(lacuna.natureza, NaturezaLacuna.AUSENTE)
        self.assertEqual(lacuna.recomendacao, 'Descreva o controle positivo e o negativo.')

    def test_sem_ia_a_lacuna_do_vazio_sai_ausente_e_a_do_escrito_fica(self):
        self.proposta(metodologia='PCR.')
        self.avaliar('pouco_desenvolvido')

        self.estruturar(ProvedorIndisponivel())

        self.assertEqual(self.lacuna_da_metodologia().natureza, NaturezaLacuna.POUCO_DESENVOLVIDO)
        self.assertEqual(
            Lacuna.objects.get(campo_afetado='objetivo_geral', resolvida=False).natureza,
            NaturezaLacuna.AUSENTE,
        )

    def test_a_pergunta_da_ia_entra_nas_perguntas_da_aba(self):
        self.proposta(metodologia='PCR.')
        self.avaliar('pouco_desenvolvido')

        perguntas = self.client.get(self.url()).data['perguntas']

        da_ia = [pergunta for pergunta in perguntas if pergunta['origem'] == 'copiloto']
        self.assertEqual(len(da_ia), 1)
        self.assertEqual(da_ia[0]['elemento'], 'metodologia')
        self.assertEqual(da_ia[0]['pergunta'], 'Quais controles serão usados?')
        self.assertTrue(all(
            pergunta['origem'] == 'base_pipe'
            for pergunta in perguntas if pergunta['elemento'] != 'metodologia'
        ))

    def test_a_tela_recebe_o_tipo_e_a_recomendacao_de_cada_lacuna(self):
        self.proposta(metodologia='PCR.')
        self.avaliar('pouco_desenvolvido')

        lacunas = self.client.get(self.url()).data['lacunas']

        metodologia = next(item for item in lacunas if item['campo_afetado'] == 'metodologia')
        self.assertEqual(metodologia['natureza_rotulo'], 'Pouco desenvolvido')
        self.assertEqual(metodologia['recomendacao'], 'Descreva o controle positivo e o negativo.')

    def test_o_relato_conta_preenchidos_sugestoes_e_lacunas(self):
        self.proposta(metodologia='PCR.')
        IniciarSessaoService(provedor=ProvedorFake(sintese=SINTESE)).execute(
            oportunidade=self.oportunidade, ator=self.supervisor
        )

        self.estruturar(ProvedorFake(proposta=saida(
            preenchimentos={'objetivo_geral': 'Detectar em 48 horas.'},
            sugestoes=[{'elemento': 'metodologia', 'texto_sugerido': 'PCR com controle.', 'motivo': ''}],
        )))

        relato = MensagemCopiloto.objects.filter(autor=AutorMensagem.COPILOTO).order_by('-ordem').first()
        self.assertIn('1 elemento preenchido', relato.conteudo)
        self.assertIn('1 sugestão', relato.conteudo)
