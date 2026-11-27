import { CONCLUIDA, EM_ANDAMENTO } from '../oportunidades/etapas'
import { SITUACOES, decisaoLabel, situacaoLabel } from '../oportunidades/oportunidadesData'

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

const ETAPAS_EM_CURSO = [
  'entrada',
  'estruturacao',
  'competencias',
  'matching',
  'pre_analise',
  'aguardando_decisao',
]

const ENCERRADAS = ['continuar', 'arquivada']

/**
 * As etapas que o Demandante acompanha, so de leitura.
 *
 * Mesma regra da barra do Supervisor (`andamentoDasEtapas`): sai da situacao,
 * e nao do historico. Revisar volta a estruturacao. Arquivada pode ter saido
 * de qualquer etapa, entao nenhuma anterior e dada como concluida - so a
 * decisao aparece. Os nomes sao os da situacao, os mesmos da lista e do
 * filtro de "Meus problemas".
 */
export function etapasDoProblema(situacao) {
  const atual = ETAPAS_EM_CURSO.indexOf(situacao === 'revisar' ? 'estruturacao' : situacao)
  const encerrada = ENCERRADAS.includes(situacao)

  const etapas = ETAPAS_EM_CURSO.map((id, indice) => ({
    id,
    label: situacaoLabel(id),
    andamento:
      situacao === 'continuar' || (atual >= 0 && indice < atual)
        ? CONCLUIDA
        : indice === atual
          ? EM_ANDAMENTO
          : null,
  }))

  etapas.push({
    id: 'decisao',
    label: encerrada ? situacaoLabel(situacao) : 'Decisão',
    andamento: encerrada ? EM_ANDAMENTO : null,
  })

  return etapas.map((etapa, indice) => ({ ...etapa, numero: indice + 1 }))
}

const DECISAO_EM_FRASE = {
  continuar: 'O Núcleo de P&D decidiu dar continuidade a este problema.',
  revisar: 'O Núcleo de P&D pediu uma complementação deste problema.',
  arquivar: 'O Núcleo de P&D decidiu arquivar este problema.',
}

export function decisaoEmFrase(tipo) {
  return DECISAO_EM_FRASE[tipo] || `Decisão do Núcleo de P&D: ${decisaoLabel(tipo)}.`
}

export function precisaComplementacao(problema) {
  return problema?.situacao === 'revisar'
}

export function emAnalise(problema) {
  return !SITUACOES.find((item) => item.id === problema.situacao)?.desfecho
}

export function resumoDoDemandante(problemas) {
  return {
    total: problemas.length,
    emAnalise: problemas.filter(emAnalise).length,
    aguardandoVoce: problemas.filter(precisaComplementacao).length,
  }
}
