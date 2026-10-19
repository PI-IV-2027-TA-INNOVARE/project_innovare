"""
Testes da Competencia Necessaria (RF05 / EP05 / PB42, PB43).

O que esta sob prova aqui: a derivacao a partir da proposta, a edicao humana do
que a IA sugeriu, e o limite que impede a derivacao de criar vocabulario novo
na rede.

Provedor sempre duble (AGENTS.md 0.1).
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.audit.models import CategoriaEvento, EventoAuditoria
from apps.competencies.models import (
    CompetenciaNecessaria,
    DerivadaDe,
    NivelImportancia,
)
from apps.competencies.services import DerivarCompetenciasService
from apps.copilot.models import PropostaEstruturada
from apps.network.models import Competencia, TipoCompetencia
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
    indicar_na_equipe,
)
from core.tests.dubles import ProvedorFake, ProvedorIndisponivel

PROPOSTA_PREENCHIDA = {
    'problema_pesquisa': 'Contaminacao resiste a pasteurizacao.',
    'objetivo_geral': 'Desenvolver protocolo de deteccao rapida.',
    'metodologia': 'Cultivo seletivo e PCR em tempo real.',
}


class CompetenciasBaseTests(TestCase):
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
            oportunidade=self.oportunidade, **PROPOSTA_PREENCHIDA
        )

        self.como(self.supervisor)

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def url(self, sufixo='competencias', *args):
        return reverse(
            f'oportunidade-{sufixo}', args=[self.oportunidade.codigo, *args]
        )

    def derivar(self, provedor=None):
        return DerivarCompetenciasService(
            provedor=provedor or ProvedorFake()
        ).execute(oportunidade=self.oportunidade, ator=self.supervisor)


class DerivacaoTests(CompetenciasBaseTests):
    def test_derivacao_cria_as_competencias_com_o_nivel_que_veio(self):
        """RF05: a derivacao distingue essencial de desejavel."""
        resultado = self.derivar()

        niveis = {
            registro.descricao: registro.nivel_importancia
            for registro in resultado['criadas']
        }

        self.assertEqual(len(resultado['criadas']), 3)
        self.assertEqual(niveis['PCR em tempo real'], NivelImportancia.ESSENCIAL)
        self.assertEqual(
            niveis['Estatistica aplicada'], NivelImportancia.DESEJAVEL
        )

    def test_derivada_fica_marcada_como_vinda_do_copiloto(self):
        """PB42: a tela precisa distinguir sugestao de IA de inclusao humana."""
        resultado = self.derivar()

        self.assertTrue(
            all(
                registro.derivada_de == DerivadaDe.COPILOTO
                for registro in resultado['criadas']
            )
        )
        self.assertTrue(
            all(registro.execucao_ia_id for registro in resultado['criadas'])
        )

    def test_derivacao_liga_no_vocabulario_quando_o_termo_existe(self):
        """O vinculo estruturado e o que faz o matching pontuar melhor."""
        termo = Competencia.objects.create(
            nome='PCR em tempo real', tipo=TipoCompetencia.TECNICA, canonica=True
        )

        self.derivar()

        self.assertEqual(
            CompetenciaNecessaria.objects.get(
                descricao='PCR em tempo real'
            ).competencia_id,
            termo.id_competencia,
        )

    def test_derivacao_nao_cria_termo_novo_no_vocabulario(self):
        """Plano 6.6: criar termo a cada rodada contaminaria a base do matching."""
        antes = Competencia.objects.count()

        self.derivar()

        self.assertEqual(Competencia.objects.count(), antes)

    def test_segunda_rodada_nao_duplica(self):
        """Derivar duas vezes e o caso normal depois de editar a proposta."""
        self.derivar()
        segunda = self.derivar()

        self.assertEqual(segunda['criadas'], [])
        self.assertEqual(CompetenciaNecessaria.objects.count(), 3)

    def test_provedor_indisponivel_nao_inventa_competencia(self):
        """AGENTS.md 0.2: fallback seguro e lista vazia, nao lista chutada."""
        resultado = self.derivar(provedor=ProvedorIndisponivel())

        self.assertEqual(resultado['criadas'], [])
        self.assertTrue(resultado['fallback_usado'])

    def test_proposta_vazia_e_conflito_explicado(self):
        """Nao se deriva competencia de proposta sem texto."""
        PropostaEstruturada.objects.filter(pk=self.proposta.pk).update(
            problema_pesquisa='', objetivo_geral='', metodologia=''
        )

        resposta = self.client.post(self.url('competencias-derivar'))

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'proposta_vazia')

    def test_derivacao_deixa_evento_na_trilha(self):
        self.derivar()

        evento = EventoAuditoria.objects.get(
            categoria=CategoriaEvento.COMPETENCIA, tipo='derivacao_executada'
        )

        self.assertEqual(evento.detalhe['derivadas'], 3)
        self.assertEqual(evento.oportunidade_id, self.oportunidade.pk)


class EdicaoHumanaTests(CompetenciasBaseTests):
    def test_supervisor_acrescenta_competencia_a_mao(self):
        """PB43: a lista nao e trancada pela IA."""
        resposta = self.client.post(
            self.url(),
            {'descricao': 'Bioinformatica', 'nivel_importancia': 'desejavel'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resposta.data['derivada_de'], DerivadaDe.MANUAL)

    def test_competencia_repetida_e_conflito(self):
        self.client.post(self.url(), {'descricao': 'Bioinformatica'}, format='json')
        resposta = self.client.post(
            self.url(), {'descricao': 'bioinformatica'}, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'competencia_duplicada')

    def test_descricao_em_branco_nao_passa(self):
        resposta = self.client.post(self.url(), {'descricao': '   '}, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_supervisor_edita_a_sugestao_da_ia(self):
        """PB42: "editaveis" e requisito, nao conveniencia."""
        criada = self.derivar()['criadas'][0]

        resposta = self.client.patch(
            self.url('competencia', criada.id_competencia_necessaria),
            {'descricao': 'Microbiologia de alimentos fermentados'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(
            resposta.data['descricao'], 'Microbiologia de alimentos fermentados'
        )

    def test_supervisor_remove_a_competencia_que_nao_se_aplica(self):
        criada = self.derivar()['criadas'][0]

        resposta = self.client.delete(
            self.url('competencia', criada.id_competencia_necessaria)
        )

        self.assertEqual(resposta.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(CompetenciaNecessaria.objects.count(), 2)

    def test_competencia_de_outra_oportunidade_nao_e_alcancavel(self):
        """O filtro pela proposta e o que impede editar por id alheio."""
        outra = OportunidadeBuilder().interna().build()
        proposta_alheia = PropostaEstruturada.objects.create(oportunidade=outra)
        alheia = CompetenciaNecessaria.objects.create(
            proposta=proposta_alheia, descricao='Competencia de outra'
        )

        resposta = self.client.patch(
            self.url('competencia', alheia.id_competencia_necessaria),
            {'descricao': 'Tentativa'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resposta.data['codigo'], 'competencia_inexistente')


class AcessoAsCompetenciasTests(CompetenciasBaseTests):
    def test_pesquisador_le_mas_nao_deriva(self):
        """D02: ele le a oportunidade que uma indicacao lhe deu."""
        self.derivar()
        indicar_na_equipe(
            self.oportunidade,
            MembroRedeBuilder().pesquisador().com_acesso(self.pesquisador).build(),
        )
        self.como(self.pesquisador)

        self.assertEqual(self.client.get(self.url()).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post(self.url('competencias-derivar')).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_demandante_nao_ve_competencia(self):
        """PB71: resultado interno nao chega ao Demandante."""
        self.como(self.demandante)

        self.assertEqual(
            self.client.get(self.url()).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_oportunidade_sem_proposta_responde_404_explicado(self):
        sem_proposta = OportunidadeBuilder().interna().build()

        resposta = self.client.get(
            reverse('oportunidade-competencias', args=[sem_proposta.codigo])
        )

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resposta.data['codigo'], 'proposta_inexistente')
