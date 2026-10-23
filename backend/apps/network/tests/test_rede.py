"""
Testes da rede interna: cadastro, consulta, liberacao de acesso e perfil.

Nenhum toca banco remoto, SMTP real ou provedor de IA (AGENTS.md 0.1).
"""
from django.core import mail
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Papel, SituacaoConta, Usuario
from apps.audit.models import EventoAuditoria
from apps.network.models import (
    DeclaradoPor,
    Formacao,
    MembroRede,
    PapelNaRede,
    SituacaoMembro,
    TipoCompetencia,
    Titulacao,
)

SENHA = 'Bioinsumo!2026'


class RedeBaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.supervisor = Usuario.objects.create_user(
            email='supervisor@ac2microbiologia.com.br',
            nome='Rafael Antunes',
            papel=Papel.SUPERVISOR,
            password=SENHA,
        )
        self.pesquisador = Usuario.objects.create_user(
            email='pesquisador@ac2microbiologia.com.br',
            nome='Maria Ferreira',
            papel=Papel.PESQUISADOR,
            password=SENHA,
        )
        self.administrador = Usuario.objects.create_user(
            email='admin@ac2microbiologia.com.br',
            nome='Administracao',
            papel=Papel.ADMINISTRADOR,
            password=SENHA,
        )
        self.mestrado = Titulacao.objects.create(
            codigo='mestrado', rotulo='Mestrado', nivel=3
        )

    def como(self, usuario):
        self.client.force_authenticate(user=usuario)

    def cadastrar(self, **extra):
        corpo = {
            'nome': 'Helena Torres',
            'email': 'Helena.Torres@ac2microbiologia.com.br',
            'papel_rede': PapelNaRede.PESQUISADOR,
            'titulacao_codigo': 'mestrado',
            'competencias': ['Bioinformática', 'Bioinformática'],
            'tecnicas': ['PCR em tempo real'],
            'linhas': ['Bioinsumos agrícolas'],
        }
        corpo.update(extra)
        return self.client.post(reverse('membro-rede-list'), corpo, format='json')


class CadastroDeMembroTests(RedeBaseTests):
    def test_supervisor_cadastra_e_a_pessoa_nasce_sem_acesso(self):
        self.como(self.supervisor)
        resposta = self.cadastrar()

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resposta.data['situacao'], SituacaoMembro.SEM_ACESSO)
        self.assertFalse(resposta.data['tem_acesso'])

        membro = MembroRede.objects.get(email_sem_conta='helena.torres@ac2microbiologia.com.br')
        self.assertIsNone(membro.usuario_id)
        self.assertEqual(membro.cadastrado_por, self.supervisor)

    def test_as_tres_listas_viram_competencias_do_tipo_certo(self):
        self.como(self.supervisor)
        resposta = self.cadastrar()

        self.assertEqual(resposta.data['competencias'], ['Bioinformática'])
        self.assertEqual(resposta.data['tecnicas'], ['PCR em tempo real'])
        self.assertEqual(resposta.data['linhas'], ['Bioinsumos agrícolas'])

        membro = MembroRede.objects.get(email_sem_conta='helena.torres@ac2microbiologia.com.br')
        tipos = {
            v.competencia.tipo for v in membro.vinculos_competencia.all()
        }
        self.assertEqual(
            tipos,
            {
                TipoCompetencia.COMPETENCIA,
                TipoCompetencia.TECNICA,
                TipoCompetencia.LINHA_PESQUISA,
            },
        )

    def test_email_duplicado_na_rede_e_conflito(self):
        self.como(self.supervisor)
        self.cadastrar()
        resposta = self.cadastrar()

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'email_duplicado')

    def test_cadastro_deixa_evento_na_trilha(self):
        self.como(self.supervisor)
        self.cadastrar()

        self.assertTrue(
            EventoAuditoria.objects.filter(
                categoria='rede', tipo='membro_cadastrado'
            ).exists()
        )

    def test_so_o_supervisor_cadastra(self):
        for usuario in (self.pesquisador, self.administrador):
            self.como(usuario)
            self.assertEqual(
                self.cadastrar().status_code, status.HTTP_403_FORBIDDEN
            )

    def test_demandante_nao_consulta_a_rede(self):
        demandante = Usuario.objects.create_user(
            email='demandante@valeverde.com.br',
            nome='Agroindustria Vale Verde',
            papel=Papel.DEMANDANTE,
            password=SENHA,
        )
        self.como(demandante)

        resposta = self.client.get(reverse('membro-rede-list'))
        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_pesquisador_consulta_mas_nao_edita(self):
        self.como(self.supervisor)
        criado = self.cadastrar()
        membro_id = criado.data['id_membro']

        self.como(self.pesquisador)
        self.assertEqual(
            self.client.get(reverse('membro-rede-list')).status_code,
            status.HTTP_200_OK,
        )
        resposta = self.client.patch(
            reverse('membro-rede-detail', args=[membro_id]),
            {'experiencia': 'editado por quem nao pode'},
            format='json',
        )
        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_busca_alcanca_competencia_e_nao_so_nome(self):
        self.como(self.supervisor)
        self.cadastrar()

        resposta = self.client.get(reverse('membro-rede-list'), {'busca': 'bioinform'})
        self.assertEqual(resposta.data['count'], 1)


class LiberacaoDeAcessoTests(RedeBaseTests):
    def setUp(self):
        super().setUp()
        self.como(self.supervisor)
        self.membro_id = self.cadastrar().data['id_membro']
        mail.outbox = []

    def url(self):
        return reverse('membro-rede-liberar-acesso', args=[self.membro_id])

    def test_liberar_cria_conta_ativa_sem_senha_utilizavel(self):
        resposta = self.client.post(self.url(), {}, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertTrue(resposta.data['tem_acesso'])
        self.assertEqual(resposta.data['situacao'], SituacaoMembro.ATIVO)

        usuario = Usuario.objects.get(email='helena.torres@ac2microbiologia.com.br')
        self.assertEqual(usuario.papel, Papel.PESQUISADOR)
        self.assertEqual(usuario.situacao, SituacaoConta.ATIVO)
        self.assertFalse(usuario.has_usable_password())

    def test_liberar_envia_convite_de_primeiro_acesso(self):
        self.client.post(self.url(), {}, format='json')
        self.assertEqual(len(mail.outbox), 1)

    def test_liberar_duas_vezes_e_conflito(self):
        self.client.post(self.url(), {}, format='json')
        resposta = self.client.post(self.url(), {}, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'acesso_ja_liberado')

    def test_email_ja_usado_por_outra_conta_e_conflito(self):
        Usuario.objects.create_user(
            email='helena.torres@ac2microbiologia.com.br',
            nome='Conta anterior',
            papel=Papel.PESQUISADOR,
        )
        resposta = self.client.post(self.url(), {}, format='json')

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'email_em_uso')

    def test_so_o_supervisor_libera(self):
        self.como(self.administrador)
        self.assertEqual(
            self.client.post(self.url(), {}, format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )


class PerfilProprioTests(RedeBaseTests):
    def setUp(self):
        super().setUp()
        self.membro = MembroRede.objects.create(
            usuario=self.pesquisador,
            papel_rede=PapelNaRede.PESQUISADOR,
            situacao=SituacaoMembro.ATIVO,
        )

    def test_pesquisador_le_e_edita_o_proprio_perfil(self):
        self.como(self.pesquisador)

        leitura = self.client.get(reverse('rede-meu-perfil'))
        self.assertEqual(leitura.status_code, status.HTTP_200_OK)
        self.assertEqual(leitura.data['nome'], 'Maria Ferreira')

        resposta = self.client.patch(
            reverse('rede-meu-perfil'),
            {
                'experiencia': 'Oito anos em microbiologia de alimentos.',
                'disponibilidade': 'integral',
                'competencias': ['Fermentação'],
            },
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['competencias'], ['Fermentação'])
        self.assertEqual(resposta.data['disponibilidade'], 'integral')

    def test_competencia_declarada_pelo_proprio_membro_fica_marcada(self):
        self.como(self.pesquisador)
        self.client.patch(
            reverse('rede-meu-perfil'),
            {'competencias': ['Fermentação']},
            format='json',
        )

        vinculo = self.membro.vinculos_competencia.get()
        self.assertEqual(vinculo.declarado_por, DeclaradoPor.MEMBRO)

    def test_nome_e_papel_na_rede_sao_cadastro_e_nao_perfil(self):
        self.como(self.pesquisador)

        self.client.patch(
            reverse('rede-meu-perfil'),
            {'nome': 'Outro Nome', 'papel_rede': PapelNaRede.SUPERVISOR},
            format='json',
        )

        self.membro.refresh_from_db()
        self.assertEqual(self.membro.nome, 'Maria Ferreira')
        self.assertEqual(self.membro.papel_rede, PapelNaRede.PESQUISADOR)

    def test_conta_sem_cadastro_na_rede_recebe_404_explicado(self):
        self.como(self.administrador)

        resposta = self.client.get(reverse('rede-meu-perfil'))
        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resposta.data['codigo'], 'sem_membro_rede')


class TitulacaoTests(RedeBaseTests):
    def test_vocabulario_de_titulacao_vem_da_api(self):
        self.como(self.pesquisador)

        resposta = self.client.get(reverse('rede-titulacoes'))
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data[0]['codigo'], 'mestrado')
        self.assertEqual(resposta.data[0]['nivel'], 3)


class VocabularioDePapelNaRedeTests(TestCase):
    """
    RN-A01 fecha os atores em Demandante Externo, Pesquisador, Supervisor e
    Administrador. "Colaborador" aparece na baseline so como prosa ("rede de
    pesquisadores, colaboradores e supervisores") e "Graduando / bolsista" nao
    aparece em documento nenhum - a Declaracao de Escopo cita bolsa apenas para
    por gestao de bolsas e vinculos fora de escopo.

    O enum alimenta o rotulo do grafico "Por papel" do painel do Supervisor,
    que lista tambem os valores com total zero: papel inexistente no dominio
    virava barra na tela.
    """

    def test_a_rede_so_reconhece_supervisor_e_pesquisador(self):
        self.assertEqual(
            [valor for valor, _ in PapelNaRede.choices],
            ['supervisor', 'pesquisador'],
        )

    def test_papel_fora_do_vocabulario_nao_passa_na_validacao_do_modelo(self):
        membro = MembroRede(
            nome_sem_conta='Fora do vocabulario', papel_rede='colaborador'
        )

        with self.assertRaises(ValidationError) as erro:
            membro.full_clean()

        self.assertIn('papel_rede', erro.exception.error_dict)


class RespostaDoSalvamentoDoCadastroTests(RedeBaseTests):
    """
    O que o `PATCH` responde e o que acabou de ser gravado (PB16).

    O `get_queryset` do viewset carrega `vinculos_competencia` com
    `prefetch_related`, e o `get_object` enche esse cache **antes** de o service
    trocar os vinculos. Serializar a mesma instancia depois devolvia a lista
    velha: a tela salvava tres competencias e recebia de volta as de antes, sem
    erro nenhum - quem conferia precisava recarregar para acreditar.

    `meu-perfil` nao mostrava o sintoma por acaso: aquele service termina com
    um `vinculos_competencia.update(...)`, e o `update` do Django zera o
    `_result_cache` do proprio queryset que estava no cache do prefetch.
    """

    def setUp(self):
        super().setUp()
        self.como(self.supervisor)
        self.membro = MembroRede.objects.create(
            nome_sem_conta='Helena Torres',
            email_sem_conta='helena.torres@ac2microbiologia.com.br',
            papel_rede=PapelNaRede.PESQUISADOR,
            situacao=SituacaoMembro.SEM_ACESSO,
        )
        self.url = reverse('membro-rede-detail', args=[self.membro.id_membro])

    def test_a_resposta_traz_as_competencias_recem_salvas(self):
        resposta = self.client.patch(
            self.url, {'competencias': ['Microbiologia']}, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.data['competencias'], ['Microbiologia'])

    def test_a_resposta_nao_repete_a_lista_do_salvamento_anterior(self):
        self.client.patch(
            self.url, {'competencias': ['Microbiologia']}, format='json'
        )

        resposta = self.client.patch(
            self.url, {'competencias': ['Genomica']}, format='json'
        )

        self.assertEqual(resposta.data['competencias'], ['Genomica'])

    def test_a_resposta_separa_as_tres_listas_pelo_tipo(self):
        resposta = self.client.patch(
            self.url,
            {
                'competencias': ['Microbiologia'],
                'tecnicas': ['PCR'],
                'linhas': ['Controle biologico'],
            },
            format='json',
        )

        self.assertEqual(resposta.data['competencias'], ['Microbiologia'])
        self.assertEqual(resposta.data['tecnicas'], ['PCR'])
        self.assertEqual(resposta.data['linhas'], ['Controle biologico'])


class IdentidadeDoMembroComAcessoTests(RedeBaseTests):
    """
    O membro nasce antes da conta (RN-A04) e, ate la, guarda o proprio nome e
    e-mail. Liberado o acesso, nome e e-mail passam a morar so na conta - o
    e-mail e o login - e o membro deixa de ter copia que possa divergir (3FN).
    """

    def setUp(self):
        super().setUp()
        self.como(self.supervisor)
        self.membro_id = self.cadastrar().data['id_membro']
        self.client.post(
            reverse('membro-rede-liberar-acesso', args=[self.membro_id]), {}, format='json'
        )
        self.conta = Usuario.objects.get(email='helena.torres@ac2microbiologia.com.br')

    def editar(self, **campos):
        return self.client.patch(
            reverse('membro-rede-detail', args=[self.membro_id]), campos, format='json'
        )

    def test_novo_nome_chega_a_conta(self):
        self.editar(nome='Helena Torres Souza')

        self.conta.refresh_from_db()
        self.assertEqual(self.conta.nome, 'Helena Torres Souza')

    def test_novo_email_vira_o_login(self):
        resposta = self.editar(email='Helena.Souza@ac2microbiologia.com.br')

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.conta.refresh_from_db()
        self.assertEqual(self.conta.email, 'helena.souza@ac2microbiologia.com.br')

    def test_email_de_outra_conta_e_conflito_e_nada_muda(self):
        Usuario.objects.create_user(
            email='ocupado@ac2microbiologia.com.br',
            nome='Outra pessoa',
            papel=Papel.SUPERVISOR,
        )

        resposta = self.editar(email='ocupado@ac2microbiologia.com.br')

        self.assertEqual(resposta.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resposta.data['codigo'], 'email_em_uso')
        self.conta.refresh_from_db()
        membro = MembroRede.objects.get(id_membro=self.membro_id)
        self.assertEqual(self.conta.email, 'helena.torres@ac2microbiologia.com.br')
        self.assertEqual(membro.email, 'helena.torres@ac2microbiologia.com.br')

    def test_com_acesso_o_membro_nao_guarda_copia(self):
        membro = MembroRede.objects.get(id_membro=self.membro_id)

        self.assertIsNone(membro.nome_sem_conta)
        self.assertIsNone(membro.email_sem_conta)
        self.assertEqual(membro.nome, self.conta.nome)
        self.assertEqual(membro.email, self.conta.email)

    def test_banco_recusa_copia_ao_lado_da_conta(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            MembroRede.objects.filter(id_membro=self.membro_id).update(
                nome_sem_conta='Copia que divergiria'
            )

    def test_banco_recusa_membro_sem_conta_e_sem_nome(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            MembroRede.objects.create(
                email_sem_conta='sem.nome@ac2microbiologia.com.br',
                papel_rede=PapelNaRede.PESQUISADOR,
            )

    def test_membro_sem_acesso_edita_sem_procurar_conta(self):
        outro = self.cadastrar(nome='Ana Lima', email='ana.lima@ac2microbiologia.com.br')

        resposta = self.client.patch(
            reverse('membro-rede-detail', args=[outro.data['id_membro']]),
            {'nome': 'Ana Lima Prado'},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertFalse(Usuario.objects.filter(nome='Ana Lima Prado').exists())


class FormacaoAcademicaTests(RedeBaseTests):
    """
    PB11: formacao e titulacao "ficam disponiveis para o matching", e o Escopo
    (secao 3.3) lista a formacao no perfil. A tabela existia sem caminho de
    entrada: nao havia campo na API nem na tela.

    O matching ainda nao le a formacao - mudar o algoritmo e portao de decisao
    (AGENTS.md 3.2). Aqui ela passa a ser gravada e lida.
    """

    HELENA = {
        'curso': 'Ciências Biológicas',
        'instituicao': 'Universidade Estadual de Campinas',
        'titulacao_codigo': 'mestrado',
        'ano_conclusao': 2019,
    }

    def setUp(self):
        super().setUp()
        self.membro = MembroRede.objects.create(
            usuario=self.pesquisador,
            papel_rede=PapelNaRede.PESQUISADOR,
            situacao=SituacaoMembro.ATIVO,
        )
        self.url_membro = reverse('membro-rede-detail', args=[self.membro.id_membro])

    def test_supervisor_cadastra_a_pessoa_com_a_formacao(self):
        self.como(self.supervisor)

        resposta = self.cadastrar(formacoes=[self.HELENA])

        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED, resposta.data)
        self.assertEqual(len(resposta.data['formacoes']), 1)
        self.assertEqual(resposta.data['formacoes'][0]['curso'], 'Ciências Biológicas')
        self.assertEqual(resposta.data['formacoes'][0]['titulacao_rotulo'], 'Mestrado')

    def test_a_edicao_troca_o_conjunto_e_a_resposta_ja_traz_o_novo(self):
        self.como(self.supervisor)
        self.client.patch(self.url_membro, {'formacoes': [self.HELENA]}, format='json')

        resposta = self.client.patch(
            self.url_membro,
            {'formacoes': [{'curso': 'Farmácia', 'instituicao': 'USP'}]},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK, resposta.data)
        self.assertEqual([item['curso'] for item in resposta.data['formacoes']], ['Farmácia'])
        self.assertEqual(Formacao.objects.filter(membro=self.membro).count(), 1)

    def test_lista_vazia_remove_todas_e_campo_ausente_preserva(self):
        self.como(self.supervisor)
        self.client.patch(self.url_membro, {'formacoes': [self.HELENA]}, format='json')

        self.client.patch(self.url_membro, {'experiencia': 'Dez anos.'}, format='json')
        self.assertEqual(Formacao.objects.filter(membro=self.membro).count(), 1)

        self.client.patch(self.url_membro, {'formacoes': []}, format='json')
        self.assertEqual(Formacao.objects.filter(membro=self.membro).count(), 0)

    def test_o_pesquisador_mantem_a_propria_formacao(self):
        self.como(self.pesquisador)

        resposta = self.client.patch(
            reverse('rede-meu-perfil'), {'formacoes': [self.HELENA]}, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK, resposta.data)
        self.assertEqual(resposta.data['formacoes'][0]['instituicao'], self.HELENA['instituicao'])

    def test_curso_e_instituicao_sao_obrigatorios(self):
        self.como(self.supervisor)

        resposta = self.client.patch(
            self.url_membro, {'formacoes': [{'curso': '', 'instituicao': 'USP'}]}, format='json'
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_ano_fora_do_razoavel_e_recusado(self):
        self.como(self.supervisor)

        resposta = self.client.patch(
            self.url_membro,
            {'formacoes': [{**self.HELENA, 'ano_conclusao': 3020}]},
            format='json',
        )

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_alteracao_fica_na_trilha(self):
        self.como(self.pesquisador)
        self.client.patch(reverse('rede-meu-perfil'), {'formacoes': [self.HELENA]}, format='json')

        evento = EventoAuditoria.objects.get(tipo='perfil_atualizado')
        self.assertIn('formacoes', evento.detalhe['campos'])
