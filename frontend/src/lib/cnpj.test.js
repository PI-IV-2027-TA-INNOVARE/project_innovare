import { describe, expect, it } from 'vitest'
import { cnpjValido, mascararCnpj, somenteDigitos } from './cnpj'
import { mascararTelefone, telefoneValido } from './telefone'

describe('cnpj', () => {
  it('aceita CNPJ com dígitos verificadores corretos, com ou sem máscara', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11444777000161')).toBe(true)
  })

  it('recusa dígito verificador errado, tamanho errado e dígitos repetidos', () => {
    expect(cnpjValido('11.222.333/0001-80')).toBe(false)
    expect(cnpjValido('11.222.333/0001')).toBe(false)
    expect(cnpjValido('00.000.000/0000-00')).toBe(false)
  })

  it('aplica a máscara 00.000.000/0000-00 enquanto a pessoa digita', () => {
    expect(mascararCnpj('112')).toBe('11.2')
    expect(mascararCnpj('112223330001')).toBe('11.222.333/0001')
    expect(mascararCnpj('11222333000181999')).toBe('11.222.333/0001-81')
  })

  it('guarda só os dígitos', () => {
    expect(somenteDigitos('11.222.333/0001-81')).toBe('11222333000181')
  })
})

describe('telefone', () => {
  it('aceita vazio, fixo e celular com DDD', () => {
    expect(telefoneValido('')).toBe(true)
    expect(telefoneValido('(19) 3333-4444')).toBe(true)
    expect(telefoneValido('19998765432')).toBe(true)
  })

  it('recusa número incompleto', () => {
    expect(telefoneValido('9988')).toBe(false)
  })

  it('aplica a máscara de fixo e de celular', () => {
    expect(mascararTelefone('1933334444')).toBe('(19) 3333-4444')
    expect(mascararTelefone('19998765432')).toBe('(19) 99876-5432')
  })
})
