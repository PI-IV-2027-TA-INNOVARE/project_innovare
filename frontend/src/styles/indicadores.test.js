import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Os cards de indicador (Painel e fila de Oportunidades).
 *
 * Com a frase que explica o que o card conta, dois cards lado a lado a 390 px
 * quebravam a frase em cinco a sete linhas e espremiam o ícone até virar um
 * ponto. No celular, card com frase fica um por linha.
 */

const consoleScss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'components', '_console.scss'),
  'utf8'
)

/**
 * A pagina Indicadores so tinha margem em cima e embaixo: titulo e cartoes
 * encostavam na borda esquerda da tela. A raiz usa a mesma margem das outras
 * paginas do console (Painel, Oportunidades, Rede, Perfil, Problemas).
 */
describe('margem da página Indicadores', () => {
  const indicadoresScss = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'app', 'indicadores', 'IndicadoresPage.scss'),
    'utf8'
  )

  it('tem a mesma margem lateral das outras páginas', () => {
    const inicio = indicadoresScss.indexOf('.indicadores-page {')
    const bloco = indicadoresScss.slice(inicio, indicadoresScss.indexOf('\n}', inicio))

    expect(inicio).toBeGreaterThanOrEqual(0)
    expect(bloco).toMatch(/width:\s*100%;/)
    expect(bloco).toMatch(/padding:\s*32px var\(--admin-gutter\) 64px;/)
  })
})

describe('cards de indicador', () => {
  it('no celular, os cards com frase ficam um por linha', () => {
    const celular = consoleScss.slice(consoleScss.indexOf('@media (max-width: 620px)'))

    expect(celular).toMatch(
      /\.stat-grid:has\(\.stat-card__nota\)\s*\{[^}]*grid-template-columns:\s*1fr/
    )
  })

  it('o ícone do card não encolhe quando o texto quebra', () => {
    expect(consoleScss).toMatch(/\n\.stat-card__icon \{[^}]*flex-shrink:\s*0/)
  })
})
