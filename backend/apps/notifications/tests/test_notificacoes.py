"""
Caixa de notificacoes (PB26 / P17).

A tabela ja era escrita antes desta camada existir: a decisao *Revisar* avisa a
organizacao demandante. O que faltava era alguem ler. Estes testes cobrem a
leitura e a baixa.

A caixa e pessoal, e o filtro por `usuario` nao e conveniencia de consulta - e
o portao. A notificacao nomeia a oportunidade no titulo, e a de um demandante
cita registro que o outro nao alcanca por `/api/oportunidades/`.

A caixa e do Demandante Externo, e nao de qualquer ator: PB26 e PB27 sao as duas
historias do backlog que citam notificacao, e as duas falam do Demandante. Por
isso o portao e por papel, e nao so `IsAuthenticated`.

Nada aqui toca banco remoto, SMTP real ou provedor de IA (AGENTS.md 0.1).
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.decisions.models import TipoDecisao
from apps.notifications.models import Notificacao
from apps.notifications.services import notificar
from core.tests.builders import (
    MembroRedeBuilder,
    OportunidadeBuilder,
    OrganizacaoBuilder,
    UsuarioBuilder,
)


class CaixaBaseTests(TestCase):
    lista = reverse('notificacoes-list')
    contador = reverse('notificacoes-nao-lidas')
    todas_lidas = reverse('notificacoes-marcar-todas-lidas')

    def setUp(self):
        self.client = APIClient()

        self.vale_verde = OrganizacaoBuilder().demandante().chamada('Vale Verde').build()
        self.terra_boa = OrganizacaoBuilder().demandante().chamada('Terra Boa').build()

        self.demandante = (
            UsuarioBuilder().demandante().na_organizacao(self.vale_verde).build()
        )
        self.outro_demandante = (
            UsuarioBuilder().demandante().na_organizacao(self.terra_boa).build()
        )
        self.supervisor = UsuarioBuilder().supervisor().build()
        self.demandante_sem_avisos = UsuarioBuilder().demandante().build()

        self.antiga = self.avisar(self.demandante, 'Primeiro aviso')
        self.recente = self.avisar(self.demandante, 'Segundo aviso')
        self.alheia = self.avisar(self.outro_demandante, 'Aviso de outra empresa')

    def avisar(self, usuario, titulo, entidade_id='OP-2026-001'):
        return notificar(
            usuario=usuario,
            tipo='oportunidade.complementacao_solicitada',
            titulo=titulo,
            mensagem='Faltam os laudos dos lotes afetados.',
            entidade='oportunidade',
            entidade_id=entidade_id,
        )

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def caixa(self, **filtros):
        return self.client.get(self.lista, filtros)

    def marcar_lida(self, notificacao):
        return self.client.post(
            reverse('notificacao-lida', args=[notificacao.id_notificacao])
        )

    def titulos(self, resposta):
        return [item['titulo'] for item in resposta.data['results']]


class EscopoDaCaixaTests(CaixaBaseTests):
    def test_cada_um_le_so_a_propria_caixa(self):
        """
        O titulo nomeia a oportunidade, e o codigo e informacao da outra
        organizacao. Vazar a caixa vazaria o que `/api/oportunidades/` nega.
        """
        self.como(self.demandante)

        self.assertEqual(
            self.titulos(self.caixa()), ['Segundo aviso', 'Primeiro aviso']
        )

    def test_anonimo_nao_le_notificacao(self):
        self.assertEqual(self.caixa().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_a_caixa_so_existe_para_o_demandante(self):
        """
        PB26 avisa o Demandante Externo da pendencia; PB27 deixa a resposta dele
        visivel ao Supervisor na propria oportunidade. Nenhuma das duas promete
        aviso ao Supervisor, ao Pesquisador ou ao Administrador - e um sino que
        o backlog nao descreveu e uma tela vazia que finge ser funcionalidade.
        Dai o 403, e nao o 200 com nada dentro.
        """
        for usuario in (
            self.supervisor,
            UsuarioBuilder().pesquisador().build(),
            UsuarioBuilder().administrador().build(),
        ):
            self.como(usuario)
            self.assertEqual(self.caixa().status_code, status.HTTP_403_FORBIDDEN)

        self.como(self.demandante)
        self.assertEqual(self.caixa().status_code, status.HTTP_200_OK)

    def test_nenhuma_rota_da_caixa_abre_para_outro_papel(self):
        """
        Esconder o sino na tela nao fecha a porta: as quatro rotas respondem ao
        mesmo papel. Se uma delas aceitasse o outro ator, sobraria uma caixa que
        so a API alcanca - e a tela que esconde o sino nao e o portao.
        """
        self.avisar(self.supervisor, 'Aviso de supervisor')

        for usuario in (
            self.supervisor,
            UsuarioBuilder().pesquisador().build(),
            UsuarioBuilder().administrador().build(),
        ):
            self.como(usuario)

            self.assertEqual(
                self.client.get(self.contador).status_code,
                status.HTTP_403_FORBIDDEN,
            )
            self.assertEqual(
                self.marcar_lida(self.antiga).status_code,
                status.HTTP_403_FORBIDDEN,
            )
            self.assertEqual(
                self.client.post(self.todas_lidas).status_code,
                status.HTTP_403_FORBIDDEN,
            )

        self.antiga.refresh_from_db()
        self.assertIsNone(self.antiga.lida_em)

    def test_a_mais_recente_vem_primeiro(self):
        """Caixa se le de cima; a ordem e parte do contrato com a tela."""
        self.como(self.demandante)

        self.assertEqual(self.titulos(self.caixa())[0], 'Segundo aviso')


class LeituraDaCaixaTests(CaixaBaseTests):
    def test_filtro_traz_so_as_nao_lidas(self):
        self.como(self.demandante)
        self.marcar_lida(self.antiga)

        self.assertEqual(
            self.titulos(self.caixa(apenas_nao_lidas='true')), ['Segundo aviso']
        )
        self.assertEqual(len(self.titulos(self.caixa())), 2)

    def test_filtro_invalido_nao_passa_calado(self):
        """
        Query string tambem e entrada externa (AGENTS.md secao 1). Sem
        contrato, `?apenas_nao_lidas=talvez` viraria filtro ignorado e o sino
        mostraria a caixa inteira acreditando ter filtrado.
        """
        self.como(self.demandante)

        self.assertEqual(
            self.caixa(apenas_nao_lidas='talvez').status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_contador_conta_so_as_nao_lidas_do_proprio_usuario(self):
        self.como(self.demandante)
        self.assertEqual(self.client.get(self.contador).data['total'], 2)

        self.marcar_lida(self.antiga)

        self.assertEqual(self.client.get(self.contador).data['total'], 1)

    def test_a_linha_carrega_a_entidade_para_a_tela_montar_o_link(self):
        """
        O destino muda com o papel - o Demandante abre `/problemas/:codigo` e
        o Supervisor `/oportunidades/:codigo`. Quem conhece rota e a tela, e o
        servidor entrega o par entidade/identificador em vez de um caminho.
        """
        self.como(self.demandante)
        linha = self.caixa().data['results'][0]

        self.assertEqual(linha['entidade'], 'oportunidade')
        self.assertEqual(linha['entidade_id'], 'OP-2026-001')
        self.assertIsNone(linha['lida_em'])


class MarcacaoDeLeituraTests(CaixaBaseTests):
    def test_marcar_como_lida_carimba_a_hora(self):
        self.como(self.demandante)
        resposta = self.marcar_lida(self.antiga)

        self.antiga.refresh_from_db()

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(self.antiga.lida_em)
        self.assertIsNotNone(resposta.data['lida_em'])

    def test_marcar_duas_vezes_nao_move_o_carimbo(self):
        """
        Idempotente: a tela marca ao abrir, e reabrir a mesma notificacao nao
        pode reescrever quando ela foi lida.
        """
        self.como(self.demandante)
        self.marcar_lida(self.antiga)

        self.antiga.refresh_from_db()
        primeiro_carimbo = self.antiga.lida_em

        self.marcar_lida(self.antiga)
        self.antiga.refresh_from_db()

        self.assertEqual(self.antiga.lida_em, primeiro_carimbo)

    def test_ninguem_marca_a_notificacao_de_outro(self):
        """
        404, nao 403: a caixa alheia nao existe para quem pergunta. Um 403
        confirmaria que aquele identificador aponta para algo real.
        """
        self.como(self.demandante)
        resposta = self.marcar_lida(self.alheia)

        self.alheia.refresh_from_db()

        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIsNone(self.alheia.lida_em)

    def test_marcar_todas_nao_alcanca_a_caixa_alheia(self):
        self.como(self.demandante)
        resposta = self.client.post(self.todas_lidas)

        self.alheia.refresh_from_db()

        self.assertEqual(resposta.data['total'], 2)
        self.assertEqual(
            Notificacao.objects.filter(
                usuario=self.demandante, lida_em__isnull=True
            ).count(),
            0,
        )
        self.assertIsNone(self.alheia.lida_em)

    def test_marcar_todas_com_a_caixa_limpa_nao_e_erro(self):
        self.como(self.demandante_sem_avisos)
        resposta = self.client.post(self.todas_lidas)

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['total'], 0)

    def test_anonimo_nao_marca_como_lida(self):
        self.assertEqual(
            self.marcar_lida(self.antiga).status_code, status.HTTP_401_UNAUTHORIZED
        )
        self.assertEqual(
            self.client.post(self.todas_lidas).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )


class NotificacaoDoFluxoChegaTests(CaixaBaseTests):
    """
    O caso de uso inteiro, de ponta a ponta.

    Os testes acima cobrem a caixa; este cobre o motivo de ela existir: o que
    o fluxo escreve tem de chegar a quem o fluxo quis avisar. Ate aqui, a
    decisao *Revisar* gravava uma linha que ninguem lia.
    """

    def setUp(self):
        super().setUp()

        self.responsavel = (
            MembroRedeBuilder().supervisor().com_acesso(self.supervisor).build()
        )
        self.oportunidade = (
            OportunidadeBuilder()
            .externa(self.vale_verde)
            .conduzida_por(self.responsavel)
            .aguardando_decisao()
            .build()
        )

    def pedir_revisao(self):
        self.como(self.supervisor)

        return self.client.post(
            reverse('oportunidade-decisao', args=[self.oportunidade.codigo]),
            {
                'tipo': TipoDecisao.REVISAR,
                'justificativa': 'Faltam os laudos microbiologicos dos lotes.',
            },
            format='json',
        )

    def test_revisar_chega_na_caixa_do_demandante(self):
        self.pedir_revisao()
        self.como(self.demandante)

        self.assertIn(
            f'{self.oportunidade.codigo} precisa de complementacao',
            self.titulos(self.caixa(apenas_nao_lidas='true')),
        )

    def test_a_decisao_nao_aparece_na_caixa_da_outra_organizacao(self):
        self.pedir_revisao()
        self.como(self.outro_demandante)

        self.assertEqual(self.client.get(self.contador).data['total'], 1)
