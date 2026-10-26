import { somenteDigitos } from './cnpj'

export function telefoneValido(valor) {
  const digitos = somenteDigitos(valor)

  if (!digitos) return true

  return (digitos.length === 10 || digitos.length === 11) && digitos[0] !== '0'
}

export function mascararTelefone(valor) {
  const d = somenteDigitos(valor).slice(0, 11)

  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`

  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
