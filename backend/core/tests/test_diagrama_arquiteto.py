"""
O banco corresponde ao Diagrama de Classes do Arquiteto.

Fonte: "Diagrama de Classes P&D - Trabalho Diego.pdf" (21 classes) e a proposta
de DDL em `querys_diagrama_arquiteto.sql`.

Duas decisoes de traducao ficam registradas aqui porque mudam a leitura do
diagrama, e um teste que as afirme e o unico lugar onde elas nao se perdem:

D-01  Heranca traduzida como discriminador: `Usuario.papel` guarda o ator, e a
      subclasse so vira tabela quando tem atributo proprio. `supervisor` e
      `administrador` sao "(sem atributos adicionais)" no diagrama - como
      tabela seriam uma coluna so, e toda consulta de perfil viraria JOIN.

D-01b `Pesquisador` do diagrama e a tabela `Membro_Rede`, nao uma satelite de
      `Usuario`. A RN-A04 exige que o Supervisor cadastre o pesquisador antes
      de liberar o acesso: em `Membro_Rede` o `id_usuario` e anulavel, e uma
      satelite com PK = FK tornaria esse cadastro impossivel.

As decisoes do relatorio "Diagrama de Classes x Banco de Dados" (21/10/2026),
seguidas pelo Arquiteto, tambem ficam aqui: os nomes de coluna do diagrama
(caso 5), um objetivo especifico por linha (caso 6), a versao dos criterios
com chave propria (caso 14 e desvio 1), a lacuna pendurada na proposta
(caso 16) e nome e e-mail do pesquisador num lugar so (desvio 2).

A leitura do schema sai da **introspeccao do Django**, e nao de
`information_schema`: o tripwire do `settings.py` desvia `DB_HOST` remoto para
SQLite em memoria (AGENTS.md 0.1), e `information_schema` nao existe lah - os
cinco testes que liam o schema erravam em toda execucao local. Suite vermelha
por motivo conhecido ensina a equipe a ignorar vermelho, que e o oposto do que
o DoD 4.1 quer. `connection.introspection` responde a mesma pergunta nos dois
bancos, entao o teste roda - em vez de ser pulado - onde quer que a suite
rode. O SQLite nao distingue maiuscula em nome de tabela - o Django nem
renomeia `usuario` para `Usuario` la -, entao a presenca da tabela e conferida
sem caixa; a caixa e conferida pelo `test_padrao_do_schema`.
"""
from django.db import connection
from django.test import TestCase

from apps.competencies.models import CompetenciaNecessaria
from apps.copilot.models import Lacuna
from apps.maturity.models import PreAnalise

CLASSES_DO_DIAGRAMA = {
    'Usuario': 'Usuario',
    'DemandanteExterno': 'Demandante_Externo',
    'Pesquisador': 'Membro_Rede',
    'Oportunidade': 'Oportunidade',
    'AnexoOportunidade': 'Anexo_Oportunidade',
    'HistoricoEvento': 'Historico_Evento',
    'PropostaEstruturada': 'Proposta_Estruturada',
    'LacunaProposta': 'Lacuna_Proposta',
    'Competencia': 'Competencia',
    'CompetenciaNecessaria': 'Competencia_Necessaria',
    'CompetenciaPerfil': 'Competencia_Perfil',
    'EquipePotencial': 'Equipe_Potencial',
    'MembroEquipe': 'Membro_Equipe',
    'LacunaCompetenciaEquipe': 'Lacuna_Competencia_Equipe',
    'DecisaoOportunidade': 'Decisao_Oportunidade',
    'CriterioReferenciaPIPE': 'Criterio_Referencia_Pipe',
    'PreAnaliseMaturidade': 'Pre_Analise_Maturidade',
    'DimensaoAnalise': 'Dimensao_Analise',
    'RecomendacaoAdequacao': 'Recomendacao_Adequacao',
}

EXIGIDAS_PELA_BASELINE = {
    'Execucao_Ia': 'RN-A07: rastreabilidade de toda saida de IA',
    'Execucao_Matching': 'RN-A07: de qual execucao veio cada indicacao',
    'Token_Acesso': 'RN-A04 / D06: primeiro acesso e recuperacao de senha',
    'Organizacao': 'L-01: CNPJ na empresa, nao repetido em cada pessoa',
    'Sessao_Copiloto': 'RF04: a conversa que produziu a proposta',
    'Mensagem_Copiloto': 'RF04: idem',
    'Titulacao': 'L-02: perfil academico comparavel pelo matching',
    'Formacao': 'L-02: idem',
    'Sequencia_Codigo': 'o codigo OP-2026-014 que a URL do front usa',
    'Notificacao': 'PB26: solicitacao de informacoes ao demandante',
    'Configuracao_Plataforma': 'configuracao administravel sem redeploy',
    'Contato_Suporte': 'canal de suporte da plataforma',
}

EXIGIDAS_PELA_NORMALIZACAO = {
    'Versao_Criterio_Pipe': 'desvio 1: a vigencia e da versao, nao do criterio',
    'Objetivo_Especifico': 'caso 6: um objetivo especifico por linha (1FN)',
}


COLUNAS_DO_DIAGRAMA = {
    'Competencia_Necessaria': ['nivel_importancia'],
    'Decisao_Oportunidade': [
        'tipo_decisao', 'observacoes', 'id_responsavel', 'data_decisao',
    ],
    'Lacuna_Proposta': [
        'campo_afetado', 'descricao', 'recomendacao', 'id_proposta',
    ],
    'Historico_Evento': ['id_oportunidade', 'tipo_evento', 'data_hora', 'descricao'],
    'Membro_Rede': ['experiencia_profissional'],
    'Oportunidade': ['status', 'data_criacao'],
    'Proposta_Estruturada': ['problema', 'inovacao', 'infraestrutura'],
    'Competencia': ['categoria'],
    'Competencia_Perfil': ['nivel_dominio'],
    'Pre_Analise_Maturidade': ['data_execucao', 'id_versao_criterio'],
    'Dimensao_Analise': ['nome_dimensao', 'nivel_maturidade', 'observacoes'],
    'Recomendacao_Adequacao': ['descricao'],
    'Criterio_Referencia_Pipe': ['id_versao_criterio'],
    'Versao_Criterio_Pipe': ['versao', 'baseline', 'vigente_de', 'vigente_ate'],
    'Objetivo_Especifico': ['id_proposta', 'ordem', 'descricao'],
}

COLUNAS_APOSENTADAS = {
    'Competencia_Necessaria': ['essencial'],
    'Decisao_Oportunidade': ['tipo', 'justificativa', 'id_autor', 'registrada_em'],
    'Lacuna_Proposta': ['id_oportunidade'],
    'Historico_Evento': ['tipo', 'ocorrido_em', 'motivo'],
    'Membro_Rede': ['experiencia'],
    'Oportunidade': ['situacao', 'criada_em'],
    'Proposta_Estruturada': [
        'problema_pesquisa', 'caracterizacao_inovacao',
        'infraestrutura_recursos', 'objetivos_especificos',
    ],
    'Competencia': ['tipo'],
    'Competencia_Perfil': ['nivel'],
    'Pre_Analise_Maturidade': ['executada_em', 'versao_criterios'],
    'Dimensao_Analise': ['dimensao', 'nivel', 'avaliacao'],
    'Recomendacao_Adequacao': ['texto'],
    'Criterio_Referencia_Pipe': ['versao', 'vigente_de', 'vigente_ate'],
}


def colunas_do_banco(tabela):
    with connection.cursor() as cursor:
        return {
            coluna.name
            for coluna in connection.introspection.get_table_description(
                cursor, tabela
            )
        }


def tabelas_do_banco():
    with connection.cursor() as cursor:
        return {
            tabela.lower()
            for tabela in connection.introspection.table_names(cursor)
        }


class DiagramaDoArquitetoTests(TestCase):
    def test_cada_classe_do_diagrama_tem_tabela(self):
        presentes = tabelas_do_banco()

        ausentes = {
            classe: tabela
            for classe, tabela in CLASSES_DO_DIAGRAMA.items()
            if tabela.lower() not in presentes
        }

        self.assertEqual(ausentes, {})

    def test_supervisor_e_administrador_sao_papel_e_nao_tabela(self):
        presentes = tabelas_do_banco()

        self.assertNotIn('supervisor', presentes)
        self.assertNotIn('administrador', presentes)

    def test_tabelas_exigidas_pela_baseline_sobrevivem_ao_diagrama(self):
        presentes = tabelas_do_banco()

        ausentes = {
            tabela: motivo
            for tabela, motivo in EXIGIDAS_PELA_BASELINE.items()
            if tabela.lower() not in presentes
        }

        self.assertEqual(ausentes, {})

    def test_tabelas_da_normalizacao_existem(self):
        presentes = tabelas_do_banco()

        ausentes = {
            tabela: motivo
            for tabela, motivo in EXIGIDAS_PELA_NORMALIZACAO.items()
            if tabela.lower() not in presentes
        }

        self.assertEqual(ausentes, {})

    def test_derivados_da_proposta_penduram_na_proposta(self):
        """
        O diagrama escreve `criar(propostaId)` nas tres classes.

        Apontar para a oportunidade identifica a mesma linha - `proposta` e
        OneToOne com ela - mas perde de qual proposta o registro foi derivado.
        A proposta tem `versao`; a oportunidade nao.
        """
        for modelo in (CompetenciaNecessaria, PreAnalise, Lacuna):
            with self.subTest(modelo=modelo.__name__):
                campo = modelo._meta.get_field('proposta')

                self.assertEqual(
                    campo.related_model._meta.db_table, 'Proposta_Estruturada'
                )
                self.assertNotIn(
                    'oportunidade',
                    [f.name for f in modelo._meta.get_fields()],
                )

    def test_colunas_do_diagrama_existem(self):
        faltando = {
            tabela: [c for c in esperadas if c not in colunas_do_banco(tabela)]
            for tabela, esperadas in COLUNAS_DO_DIAGRAMA.items()
        }

        self.assertEqual({t: c for t, c in faltando.items() if c}, {})

    def test_nomes_antigos_nao_sobrevivem_ao_lado_dos_novos(self):
        """
        Renomear e mover, nao copiar.

        A coluna antiga mantida ao lado da nova e o comeco de duas verdades
        para o mesmo fato - e ninguem descobre qual vale ate divergirem.
        """
        remanescentes = {
            tabela: [c for c in antigas if c in colunas_do_banco(tabela)]
            for tabela, antigas in COLUNAS_APOSENTADAS.items()
        }

        self.assertEqual({t: c for t, c in remanescentes.items() if c}, {})
