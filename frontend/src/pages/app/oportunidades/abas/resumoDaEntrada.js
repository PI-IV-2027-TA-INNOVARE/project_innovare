const CABECAS = [
  ['problema', /^problema:\s*/i],
  ['contexto', /^contexto:\s*/i],
  ['faltas', /^o que falta:\s*/i],
]

const ORIGEM_DA_ENTRADA = 'Entrada'
const SEPARADOR = '\nResposta: '

export function lerResumo(texto = '') {
  const partes = { livre: [], problema: [], contexto: [], faltas: [] }
  let atual = 'livre'

  for (const linha of (texto || '').split('\n')) {
    let conteudo = linha.trim()
    const cabeca = CABECAS.find(([, padrao]) => padrao.test(conteudo))

    if (cabeca) {
      atual = cabeca[0]
      conteudo = conteudo.replace(cabeca[1], '')
    }

    if (conteudo) partes[atual].push(conteudo)
  }

  return {
    livre: partes.livre.join('\n'),
    problema: partes.problema.join('\n'),
    contexto: partes.contexto.join('\n'),
    faltas: partes.faltas.map((item) => item.replace(/^[-•*]\s*/, '')).filter(Boolean),
  }
}

export function respostaDaEntrada(pergunta, texto) {
  return `[${ORIGEM_DA_ENTRADA}] ${pergunta}${SEPARADOR}${texto}`
}

export function lerMensagem(conteudo = '') {
  const [cabeca, ...resto] = conteudo.split(SEPARADOR)

  if (resto.length === 0) return { origem: '', pergunta: '', resposta: conteudo }

  const marca = cabeca.match(/^\[([^\]]+)\]\s*([\s\S]*)$/)

  return {
    origem: marca ? marca[1] : '',
    pergunta: marca ? marca[2] : cabeca,
    resposta: resto.join(SEPARADOR),
  }
}

export function ehDaEntrada(origem) {
  return origem === ORIGEM_DA_ENTRADA
}

export function respostasDaEntrada(mensagens = []) {
  const respostas = new Map()

  for (const mensagem of mensagens) {
    if (mensagem.autor !== 'humano') continue

    const { origem, pergunta, resposta } = lerMensagem(mensagem.conteudo)
    if (ehDaEntrada(origem)) respostas.set(pergunta, resposta)
  }

  return respostas
}
