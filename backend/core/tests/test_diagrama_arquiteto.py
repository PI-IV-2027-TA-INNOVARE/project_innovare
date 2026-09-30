"""
O banco corresponde ao Diagrama de Classes do Arquiteto.

Fonte: "Diagrama de Classes P&D - Trabalho Diego.pdf" (21 classes) e a proposta
de DDL em `querys_diagrama_arquiteto.sql`.

Duas decisoes de traducao ficam registradas aqui porque mudam a leitura do
diagrama, e um teste que as afirme e o unico lugar onde elas nao se perdem:

D-01  Heranca traduzida como discriminador: `usuario.papel` guarda o ator, e a
      subclasse so vira tabela quando tem atributo proprio. `supervisor` e
      `administrador` sao "(sem atributos adicionais)" no diagrama - como
      tabela seriam uma coluna so, e toda consulta de perfil viraria JOIN.

D-01b `Pesquisador` do diagrama e a tabela `membro_rede`, nao uma satelite de
      `usuario`. A RN-A04 exige que o Supervisor cadastre o pesquisador antes
      de liberar o acesso: em `membro_rede` o `id_usuario` e anulavel, e uma
      satelite com PK = FK tornaria esse cadastro impossivel.
"""
from django.db import connection
from django.test import TestCase

from apps.competencies.models import CompetenciaNecessaria
from apps.maturity.models import PreAnalise

CLASSES_DO_DIAGRAMA = {
    'usuario': 'usuario',
    'DemandanteExterno': 'demandante_externo',
    'Pesquisador': 'membro_rede',
    'Oportunidade': 'oportunidade',
    'AnexoOportunidade': 'anexo_oportunidade',
    'HistoricoEvento': 'historico_evento',
    'PropostaEstruturada': 'proposta_estruturada',
    'LacunaProposta': 'lacuna_proposta',
    'Competencia': 'competencia',
    'CompetenciaNecessaria': 'competencia_necessaria',
    'CompetenciaPerfil': 'competencia_perfil',
    'EquipePotencial': 'equipe_potencial',
    'MembroEquipe': 'membro_equipe',
    'LacunaCompetenciaEquipe': 'lacuna_competencia_equipe',
    'DecisaoOportunidade': 'decisao_oportunidade',
    'CriterioReferenciaPIPE': 'criterio_referencia_pipe',
    'PreAnaliseMaturidade': 'pre_analise_maturidade',
    'DimensaoAnalise': 'dimensao_analise',
    'RecomendacaoAdequacao': 'recomendacao_adequacao',
}

EXIGIDAS_PELA_BASELINE = {
    'execucao_ia': 'RN-A07: rastreabilidade de toda saida de IA',
    'execucao_matching': 'RN-A07: de qual execucao veio cada indicacao',
    'token_acesso': 'RN-A04 / D06: primeiro acesso e recuperacao de senha',
    'organizacao': 'L-01: CNPJ na empresa, nao repetido em cada pessoa',
    'sessao_copiloto': 'RF04: a conversa que produziu a proposta',
    'mensagem_copiloto': 'RF04: idem',
    'titulacao': 'L-02: perfil academico comparavel pelo matching',
    'formacao': 'L-02: idem',
    'sequencia_codigo': 'o codigo OP-2026-014 que a URL do front usa',
    'notificacao': 'PB26: solicitacao de informacoes ao demandante',
    'configuracao_plataforma': 'configuracao administravel sem redeploy',
    'contato_suporte': 'canal de suporte da plataforma',
}


COLUNAS_DO_DIAGRAMA = {
    'competencia_necessaria': ['nivel_importancia'],
    'decisao_oportunidade': ['tipo_decisao', 'observacoes', 'id_responsavel'],
    'lacuna_proposta': ['campo_afetado', 'descricao', 'recomendacao'],
    'historico_evento': ['id_oportunidade'],
}

COLUNAS_APOSENTADAS = {
    'competencia_necessaria': ['essencial'],
    'decisao_oportunidade': ['tipo', 'justificativa', 'id_autor'],
}


def colunas_do_banco(tabela):
    with connection.cursor() as cursor:
        cursor.execute(
            'SELECT column_name FROM information_schema.columns '
            'WHERE table_schema = %s AND table_name = %s',
            ['public', tabela],
        )
        return {linha[0] for linha in cursor.fetchall()}


def tabelas_do_banco():
    with connection.cursor() as cursor:
        cursor.execute(
            'SELECT table_name FROM information_schema.tables '
            'WHERE table_schema = %s',
            ['public'],
        )
        return {linha[0] for linha in cursor.fetchall()}


class DiagramaDoArquitetoTests(TestCase):
    def test_cada_classe_do_diagrama_tem_tabela(self):
        presentes = tabelas_do_banco()

        ausentes = {
            classe: tabela
            for classe, tabela in CLASSES_DO_DIAGRAMA.items()
            if tabela not in presentes
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
            if tabela not in presentes
        }

        self.assertEqual(ausentes, {})

    def test_derivados_da_proposta_penduram_na_proposta(self):
        """
        O diagrama escreve `criar(propostaId)` nas duas classes.

        Apontar para a oportunidade identifica a mesma linha - `proposta` e
        OneToOne com ela - mas perde de qual proposta o registro foi derivado.
        A proposta tem `versao`; a oportunidade nao.
        """
        for modelo in (CompetenciaNecessaria, PreAnalise):
            with self.subTest(modelo=modelo.__name__):
                campo = modelo._meta.get_field('proposta')

                self.assertEqual(
                    campo.related_model._meta.db_table, 'proposta_estruturada'
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
