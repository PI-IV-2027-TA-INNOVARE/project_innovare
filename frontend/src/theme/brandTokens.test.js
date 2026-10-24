import { describe, expect, it } from 'vitest'
import {
  BRAND_TOKENS,
  buildCssVariables,
  getDefaultBranding,
  isValidColor,
  isValidHex,
} from './brandTokens'

describe('isValidHex', () => {
  it('aceita hexadecimal de tres e de seis digitos, com ou sem caixa alta', () => {
    for (const cor of ['#f80', '#F80', '#1b5e20', '#1B5E20']) {
      expect(isValidHex(cor)).toBe(true)
    }
  })

  it('recusa o que nao e cor, inclusive hex pela metade', () => {
    for (const cor of ['banana', '#', '#1', '#12', '#1B5E', '#12345', '1B5E20', '', null]) {
      expect(isValidHex(cor)).toBe(false)
    }
  })
})

describe('buildCssVariables', () => {
  it('publica o token quando a cor e valida', () => {
    const variaveis = buildCssVariables({ accentPrimary: '#1B5E20' })

    expect(variaveis['--accent-primary']).toBe('#1B5E20')
  })

  it('ignora valor que nao e cor em vez de escrever custom property invalida', () => {
    const variaveis = buildCssVariables({ accentPrimary: 'banana' })

    expect(variaveis).not.toHaveProperty('--accent-primary')
  })

  it('ignora o hex pela metade que o admin ainda esta digitando', () => {
    for (const parcial of ['#', '#1', '#12', '#1B5E', '#12345']) {
      const variaveis = buildCssVariables({ accentPrimary: parcial })

      expect(variaveis).not.toHaveProperty('--accent-primary')
    }
  })

  it('a cor invalida de um token nao derruba os outros', () => {
    const variaveis = buildCssVariables({
      accentPrimary: 'banana',
      bgPrimary: '#FFFFFF',
    })

    expect(variaveis).not.toHaveProperty('--accent-primary')
    expect(variaveis['--bg-primary']).toBe('#FFFFFF')
  })

  it('nao derruba nenhuma derivada da cor invalida', () => {
    const variaveis = buildCssVariables({ accentPrimary: 'banana' })

    expect(Object.values(variaveis).some((v) => String(v).includes('banana')))
      .toBe(false)
  })
})

describe('isValidColor', () => {
  it('aceita o hexadecimal que o seletor de cor produz', () => {
    expect(isValidColor('#1B5E20')).toBe(true)
    expect(isValidColor('#f80')).toBe(true)
  })

  it('aceita rgb/rgba, que e como os tokens translucidos nascem', () => {
    for (const cor of [
      'rgba(224, 123, 26, 0.16)',
      'rgba(237, 241, 247, 0.14)',
      'rgb(27, 94, 32)',
      'rgba(0,0,0,1)',
    ]) {
      expect(isValidColor(cor)).toBe(true)
    }
  })

  it('recusa o que nao e cor', () => {
    for (const cor of ['banana', '#1B5E', 'rgba(1,2)', 'url(x)', '', null]) {
      expect(isValidColor(cor)).toBe(false)
    }
  })
})

describe('a paleta padrao da AC2', () => {
  for (const tema of ['light', 'dark']) {
    it(`entrega cor valida em todos os tokens do tema ${tema}`, () => {
      const padrao = getDefaultBranding(tema)
      const invalidos = BRAND_TOKENS.filter(
        (token) => !isValidColor(padrao[token.id])
      ).map((token) => token.id)

      expect(invalidos).toEqual([])
    })
  }

  it('publica toda a paleta padrao como custom property, nos dois temas', () => {
    for (const tema of ['light', 'dark']) {
      const variaveis = buildCssVariables(getDefaultBranding(tema))

      for (const token of BRAND_TOKENS) {
        expect(variaveis).toHaveProperty(token.cssVar)
      }
    }
  })
})
