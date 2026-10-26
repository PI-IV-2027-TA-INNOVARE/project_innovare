import { describe, expect, it } from 'vitest'
import { JARGAO_FORA_DA_TELA } from './glossario'

const FONTES = import.meta.glob(
  ['../**/*.jsx', '../**/*.js', '!../**/*.test.jsx', '!../**/*.test.js', '!../test/**'],
  { query: '?raw', import: 'default', eager: true }
)

const JARGAO = new RegExp(`\\b(${JARGAO_FORA_DA_TELA.join('|')})\\b`, 'i')

function semComentarios(fonte) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function textosDeTela(fonte) {
  const limpo = semComentarios(fonte)
  const textos = []

  for (const [, texto] of limpo.matchAll(/>([^<>{}]*[A-Za-zÀ-ú][^<>{}]*)</g)) {
    if (!/[=();]|=>|&&/.test(texto)) textos.push(texto.trim())
  }

  for (const [, , texto] of limpo.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
    if (/\s/.test(texto.trim()) || /^[A-ZÀ-Ú]/.test(texto)) textos.push(texto)
  }

  return textos
}

describe('linguagem das telas', () => {
  it('nenhum texto de tela usa jargão técnico (rerank, fallback, score, embedding, baseline)', () => {
    expect(Object.keys(FONTES).length).toBeGreaterThan(50)

    const achados = Object.entries(FONTES).flatMap(([arquivo, fonte]) =>
      textosDeTela(fonte)
        .filter((texto) => JARGAO.test(texto))
        .map((texto) => `${arquivo}: ${texto}`)
    )

    expect(achados).toEqual([])
  })

  it('o teste enxerga jargão escrito numa tela', () => {
    const fonte = 'export default () => <p>Nota abaixo do score mínimo</p>'

    expect(textosDeTela(fonte).some((texto) => JARGAO.test(texto))).toBe(true)
  })

  it('não confunde nome de variável com texto de tela', () => {
    const fonte = 'const x = dados.score_medio ?? fallbackDaTela'

    expect(textosDeTela(fonte).some((texto) => JARGAO.test(texto))).toBe(false)
  })
})
