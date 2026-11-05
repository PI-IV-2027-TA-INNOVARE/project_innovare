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
  embedding: 'Afinidade com o tema',
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

export function explicarMotivoSemIa(motivo) {
  return MOTIVOS_SEM_IA[motivo] || MOTIVOS_SEM_IA.ia_indisponivel
}

export const TERMOS = Object.freeze({
  revisaoDaIa: 'Revisão da IA',
  notaMinima: 'nota mínima',
  semAfinidade: 'Sem afinidade com o tema',
})
