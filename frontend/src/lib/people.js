/**
 * Helpers de identidade de pessoas — compartilhados pelas telas de gestão.
 *
 * Vivem fora das telas porque a mesma pessoa aparece em três lugares (Usuários
 * no console do Administrador, Rede interna do Supervisor, Meu Perfil do
 * Pesquisador) e as iniciais, o tom do avatar e a leitura do último acesso
 * precisam ser idênticos nos três — senão a mesma conta parece duas contas.
 */

const DIA = 24 * 60 * 60 * 1000

/** "Maria Ferreira" -> "MF". Nome de uma palavra usa as duas primeiras letras. */
export function iniciais(nome) {
  const partes = String(nome || '')
    .replace(/[—·]/g, ' ')
    .split(/\s+/)
    .filter((parte) => parte.length > 1)

  if (partes.length === 0) return '??'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()

  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/**
 * Tom do avatar (1..3), estável para o mesmo nome.
 *
 * São os três acentos que já existem na paleta — laranja, azul e verde. Não há
 * cor nova: o avatar só distribui as institucionais.
 */
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

/** "Hoje às 09:21" · "Ontem às 18:02" · "Há 3 dias" · "12/03/2026". */
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
