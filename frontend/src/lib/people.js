const DIA = 24 * 60 * 60 * 1000

export function iniciais(nome) {
  const partes = String(nome || '')
    .replace(/[—·]/g, ' ')
    .split(/\s+/)
    .filter((parte) => parte.length > 1)

  if (partes.length === 0) return '??'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()

  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export function tomDoAvatar(nome) {
  const texto = String(nome || '')
  let soma = 0

  for (let i = 0; i < texto.length; i += 1) {
    soma += texto.charCodeAt(i)
  }

  return (soma % 3) + 1
}

const HORAS_MINUTOS = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const DATA_CURTA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function formatarUltimoAcesso(timestamp, referencia = Date.now()) {
  if (!timestamp) return 'Nunca acessou'

  const data = new Date(timestamp)
  const inicioDeHoje = new Date(referencia)
  inicioDeHoje.setHours(0, 0, 0, 0)

  const diasAtras = Math.floor((inicioDeHoje.getTime() - data.getTime()) / DIA) + 1

  if (data.getTime() >= inicioDeHoje.getTime()) {
    return `Hoje às ${HORAS_MINUTOS.format(data)}`
  }

  if (diasAtras === 1) {
    return `Ontem às ${HORAS_MINUTOS.format(data)}`
  }

  if (diasAtras < 30) {
    return `Há ${diasAtras} dias`
  }

  return DATA_CURTA.format(data)
}
