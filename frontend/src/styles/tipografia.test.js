import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Tamanho minimo dos textos de formulario, medido na fonte do SCSS.
 *
 * Proposta, Copiloto e cadastros sao telas de ler e escrever texto longo. Com
 * rotulo de 13 px, campo de 14 px e dica de 12 px, a leitura cansava, e a
 * descricao dos cartoes ainda perdia contraste por `opacity`. Os minimos
 * abaixo sao os da revisao de usabilidade: rotulo 14 px, campo 15 px e dica
 * 13 px, numa base de 16 px.
 */

function fonte(caminho) {
  return readFileSync(fileURLToPath(new URL(caminho, import.meta.url)), 'utf8')
}

const console_ = fonte('./components/_console.scss')

function bloco(seletor) {
  const inicio = console_.indexOf('\n' + seletor + ' {')

  if (inicio < 0) throw new Error('Nao achei a regra ' + seletor + ' em _console.scss.')

  const fim = console_.indexOf('\n}', inicio)
  return console_.slice(inicio, fim)
}

function tamanhoEmRem(seletor) {
  const achado = bloco(seletor).match(/font-size:\s*([\d.]+)rem/)

  if (!achado) throw new Error(seletor + ' nao declara font-size em rem.')

  return Number(achado[1])
}

describe('tipografia dos formularios', () => {
  it.each([
    ['.admin-field__label', 0.875],
    ['.admin-input', 0.9375],
    ['.admin-field__hint', 0.8125],
    ['.perfil-card__description', 0.875],
  ])('%s tem ao menos %srem', (seletor, minimo) => {
    expect(tamanhoEmRem(seletor)).toBeGreaterThanOrEqual(minimo)
  })

  it('a descricao do cartao nao perde contraste por opacidade', () => {
    expect(bloco('.perfil-card__description')).not.toMatch(/opacity:\s*0?\.\d/)
  })
})
