/**
 * Glossário de tela: o nome que cada coisa técnica tem diante de quem usa.
 *
 * A revisão de linguagem acontece aqui. Uma tela que precisa nomear parcela
 * da nota, operação de IA ou etapa da IA busca o nome neste módulo, e o teste
 * de linguagem recusa o jargão que não deve chegar à tela.
 */

export const JARGAO_FORA_DA_TELA = Object.freeze([
  'rerank',
  'fallback',
  'score',
  'embedding',
  'baseline',
])

export const PARCELAS_DA_NOTA = Object.freeze({
  semantico: 'Afinidade com o tema',
  lexical: 'Palavras em comum',
  area: 'Área de atuação',
  disponibilidade: 'Disponibilidade',
})

export const OPERACOES_DE_IA = Object.freeze({
  copiloto: 'Copiloto',
  competencias: 'Competências',
  matching: 'Matching',
  preanalise: 'Pré-análise',
  embedding: 'Comparação com a rede',
})

export const DESCRICOES_DAS_OPERACOES = Object.freeze({
  copiloto: 'Organiza a proposta a partir do que foi escrito na oportunidade.',
  competencias: 'Lista as competências que a proposta exige.',
  matching: 'Reordena os pesquisadores sugeridos para a equipe.',
  preanalise: 'Avalia a maturidade da proposta para o PIPE/FAPESP.',
  embedding:
    'Mede a afinidade de cada pesquisador com o tema da oportunidade, durante o matching. Roda na própria plataforma, sem custo.',
})

export const MOTIVOS_SEM_IA = Object.freeze({
  ia_indisponivel: 'o serviço de IA está indisponível',
  falha_do_provedor: 'o serviço de IA não respondeu',
  limite_da_oportunidade:
    'esta oportunidade atingiu o limite de gasto com IA. Quem administra a plataforma pode rever o limite',
  limite_do_mes:
    'o limite mensal de gasto com IA foi atingido. A IA volta no próximo mês ou quando o limite for aumentado',
})

export const LIMITES_DE_GASTO = Object.freeze(['limite_da_oportunidade', 'limite_do_mes'])

export const MOTIVOS_DE_FALHA_DA_PREANALISE = Object.freeze({
  fila_indisponivel: 'a fila de processamento não estava disponível',
  falha_na_execucao: 'a execução falhou antes de terminar',
  ator_indisponivel: 'quem pediu a análise não está mais disponível',
  provedor_indisponivel: 'o serviço de IA não respondeu',
  limite_da_oportunidade: MOTIVOS_SEM_IA.limite_da_oportunidade,
  limite_do_mes: MOTIVOS_SEM_IA.limite_do_mes,
  saida_invalida: 'a resposta da IA veio incompleta',
  sem_dimensoes: 'a IA não avaliou nenhuma dimensão',
  execucao_interrompida: 'ela passou do tempo esperado sem terminar',
})

export function explicarMotivoSemIa(motivo) {
  return MOTIVOS_SEM_IA[motivo] || MOTIVOS_SEM_IA.ia_indisponivel
}

export const TERMOS = Object.freeze({
  revisaoDaIa: 'Revisão da IA',
  notaMinima: 'nota mínima',
  semAfinidade: 'Sem afinidade com o tema',
})
