const PESOS_PRIMEIRO = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const PESOS_SEGUNDO = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

function digito(numeros, pesos) {
  const soma = pesos.reduce((total, peso, indice) => total + Number(numeros[indice]) * peso, 0)
  const resto = soma % 11
  return resto < 2 ? '0' : String(11 - resto)
}

export function cnpjValido(valor) {
  const digitos = somenteDigitos(valor)

  if (digitos.length !== 14 || /^(\d)\1+$/.test(digitos)) {
    return false
  }

  const primeiro = digito(digitos.slice(0, 12), PESOS_PRIMEIRO)
  const segundo = digito(digitos.slice(0, 12) + primeiro, PESOS_SEGUNDO)

  return digitos.slice(12) === primeiro + segundo
}

export function mascararCnpj(valor) {
  const d = somenteDigitos(valor).slice(0, 14)

  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`

  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}
