import { appIcons } from '../../../lib/icons'

export const ETAPAS = [
  {
    id: 'contexto',
    label: 'Contexto',
    icon: appIcons.folder,
    resumo: 'Confira a entrada: o problema ou a ideia que deu origem à oportunidade.',
  },
  {
    id: 'copiloto',
    label: 'Copiloto',
    icon: appIcons.compass,
    resumo: 'Responda as perguntas e peça ao Copiloto uma primeira versão da proposta.',
  },
  {
    id: 'proposta',
    label: 'Proposta estruturada',
    icon: appIcons.edit,
    resumo: 'Revise e ajuste o texto. Salvar registra a sua revisão.',
  },
  {
    id: 'competencias',
    label: 'Competências',
    icon: appIcons.role,
    resumo: 'Identifique o que é preciso saber para executar a pesquisa.',
  },
  {
    id: 'equipe',
    label: 'Equipe potencial',
    icon: appIcons.users,
    resumo: 'Compare as competências com a rede interna e valide a equipe sugerida.',
  },
  {
    id: 'pre-analise',
    label: 'Pré-análise',
    icon: appIcons.researcher,
    resumo: 'Veja a maturidade da proposta frente ao PIPE/FAPESP e o que melhorar.',
  },
  {
    id: 'decisao',
    label: 'Decisão',
    icon: appIcons.decision,
    resumo: 'Registre se a oportunidade continua, precisa de revisão ou será arquivada.',
  },
].map((etapa, indice) => ({ ...etapa, numero: indice + 1 }))

export const REGISTROS = [
  { id: 'anexos', label: 'Anexos', icon: appIcons.folder },
  { id: 'historico', label: 'Histórico', icon: appIcons.history },
]

export function etapaPorId(id) {
  return ETAPAS.find((etapa) => etapa.id === id)
}
