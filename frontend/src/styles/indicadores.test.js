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
