import {
  OPORTUNIDADES_EXEMPLO,
  SITUACOES,
  situacaoLabel,
} from '../oportunidades/oportunidadesData'

export const CATEGORIAS_VISIVEIS = Object.freeze(['oportunidade', 'decisao'])

export const ESTAGIOS = Object.freeze({
  entrada: 'Recebido pela AC2. A análise ainda não começou.',
  estruturacao: 'A AC2 está estruturando a proposta a partir do que você enviou.',
  competencias: 'Análise interna em andamento no Núcleo de P&D.',
  matching: 'Análise interna em andamento no Núcleo de P&D.',
  pre_analise: 'Análise interna em andamento no Núcleo de P&D.',
  aguardando_decisao:
    'Estruturação concluída. Aguardando a decisão do Núcleo de P&D da AC2.',
  continuar: 'O Núcleo de P&D decidiu dar continuidade a este problema.',
  revisar: 'O Núcleo de P&D pediu complementação. Veja abaixo o que falta.',
  arquivada: 'Saiu do fluxo ativo. O registro e o histórico ficam preservados.',
})

export function estagioDoDemandante(situacao) {
  return ESTAGIOS[situacao] || situacaoLabel(situacao)
}

export function problemasDe(nome, oportunidades = OPORTUNIDADES_EXEMPLO) {
  if (!nome) return []

  return oportunidades.filter(
    (item) => item.origem === 'externo' && item.demandante === nome
  )
}

export function problemaDe(nome, id, oportunidades = OPORTUNIDADES_EXEMPLO) {
  return problemasDe(nome, oportunidades).find((item) => item.id === id) || null
}

export function precisaComplementacao(problema) {
  return problema?.situacao === 'revisar'
}

export function emAnalise(problema) {
  return !SITUACOES.find((item) => item.id === problema.situacao)?.desfecho
}

export function historicoVisivel(historico = []) {
  const eventos = historico
    .filter((evento) => CATEGORIAS_VISIVEIS.includes(evento.categoria))
    .sort((a, b) => b.em - a.em)

  return { eventos, internos: historico.length - eventos.length }
}

export function resumoDoDemandante(problemas) {
  return {
    total: problemas.length,
    emAnalise: problemas.filter(emAnalise).length,
    aguardandoVoce: problemas.filter(precisaComplementacao).length,
  }
}
