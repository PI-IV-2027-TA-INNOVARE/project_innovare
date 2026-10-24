import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Contraste dos textos auxiliares, medido na fonte dos tokens.
 *
 * Por que isto e teste e nao revisao visual: contraste insuficiente nao
 * quebra nada, nao aparece em nenhum log e some num monitor bom. Quem paga
 * e quem le a tela numa sala clara, num projetor, ou com baixa visao.
 *
 * O caso vale para o `::placeholder` porque nesta plataforma ele **carrega
 * orientacao**, nao decoracao: na tela Meu Perfil os exemplos de competencia,
 * tecnica e linha de pesquisa vivem no placeholder. Texto que instrui precisa
 * dos 4,5:1 da WCAG 2.2 AA para texto normal.
 *
 * A conta e feita a partir do SCSS de verdade - token de cor, fundo e a
 * opacidade aplicada - porque e a combinacao dos tres que o olho recebe. Um
 * token com contraste otimo atras de `opacity: .75` chega ao usuario abaixo
 * do minimo, e foi exatamente o que aconteceu aqui.
 */

const AA_TEXTO_NORMAL = 4.5

function fonte(caminho) {
  return readFileSync(
    fileURLToPath(new URL(caminho, import.meta.url)),
    'utf8'
  )
}

function valorDeVariavel(scss, nome) {
  const prefixo = '$' + nome + ':'
  const linha = scss
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefixo))

  const hex = linha ? linha.match(/#[0-9a-f]{6}/i) : null

  if (!hex) {
    throw new Error(
      'A variavel ' + prefixo + ' saiu de _colors.scss ou deixou de ser hex.'
    )
  }

  return hex[0]
}

function opacidadeDoPlaceholder(scss, seletor) {
  const inicio = scss.indexOf('.' + seletor + ' {')

  if (inicio < 0) {
    throw new Error('Nao achei a regra .' + seletor + ' em _console.scss.')
  }

  const fim = scss.indexOf('\n}', inicio)
  const bloco = scss.slice(inicio, fim < 0 ? undefined : fim)
  const placeholder = bloco.indexOf('::placeholder')

  if (placeholder < 0) {
    throw new Error('A regra .' + seletor + ' perdeu o ::placeholder.')
  }

  const declarada = bloco.slice(placeholder).match(/opacity: *([0-9.]+)/)

  return declarada ? Number(declarada[1]) : 1
}

function luminancia(hex) {
  const canal = (valor) => {
    const v = valor / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }

  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

function sobre(frente, fundo, alfa) {
  const canais = [1, 3, 5].map((i) => {
    const f = parseInt(frente.slice(i, i + 2), 16)
    const b = parseInt(fundo.slice(i, i + 2), 16)
    return Math.round(f * alfa + b * (1 - alfa))
  })

  return `#${canais.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function contraste(frente, fundo) {
  const a = luminancia(frente)
  const b = luminancia(fundo)

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const cores = fonte('./variables/_colors.scss')
const console_ = fonte('./components/_console.scss')

const TEMAS = [
  { nome: 'claro', muted: 'color-text-muted', fundo: 'color-surface' },
  { nome: 'escuro', muted: 'color-text-muted-dark', fundo: 'color-surface-dark' },
]

const CAMPOS = ['admin-input', 'admin-search__input']

describe('contraste do placeholder — WCAG 2.2 AA', () => {
  for (const campo of CAMPOS) {
    for (const tema of TEMAS) {
      it(`.${campo} no tema ${tema.nome} entrega 4,5:1 ao usuario`, () => {
        const frente = valorDeVariavel(cores, tema.muted)
        const fundo = valorDeVariavel(cores, tema.fundo)
        const alfa = opacidadeDoPlaceholder(console_, campo)

        const efetiva = sobre(frente, fundo, alfa)
        const razao = contraste(efetiva, fundo)

        expect(
          razao,
          `${frente} a ${alfa} de opacidade sobre ${fundo} chega como ${efetiva} `
            + `= ${razao.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
      })
    }
  }
})
