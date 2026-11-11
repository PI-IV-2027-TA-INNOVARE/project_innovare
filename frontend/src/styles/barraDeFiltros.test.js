import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A barra de filtros das listas (busca à esquerda, ações à direita).
 *
 * Todo `.admin-input` ocupa a largura inteira, que é o certo num formulário.
 * Na área de ações da barra, isso fazia cada seletor tomar a linha toda: na
 * Rede interna, papel e situação ficavam empilhados e largos, e o botão
 * "Sem competência declarada" virava uma terceira linha. Na barra, o seletor
 * tem largura própria; em tela estreita, os seletores dividem a linha.
 */

const consoleScss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'components', '_console.scss'),
  'utf8'
)

function bloco(seletor, fonte = consoleScss) {
  const inicio = fonte.indexOf('\n' + seletor + ' {')

  if (inicio < 0) throw new Error('Nao achei a regra ' + seletor + ' em _console.scss.')

  return fonte.slice(inicio, fonte.indexOf('\n}', inicio))
}

describe('barra de filtros das listas', () => {
  it('na área de ações, o seletor tem largura própria e não toma a linha', () => {
    expect(bloco('.admin-toolbar__actions')).toMatch(
      /\.admin-input--select\s*\{[^}]*width:\s*auto/
    )
  })

  it('os itens da área de ações ficam alinhados pelo meio', () => {
    expect(bloco('.admin-toolbar__actions')).toMatch(/align-items:\s*center/)
  })

  it('em tela estreita, os seletores dividem a linha em vez de empilhar', () => {
    const estreita = consoleScss.slice(consoleScss.indexOf('@media (max-width: 860px)'))

    expect(estreita).toMatch(
      /\.admin-toolbar__actions\s*\{[^@]*\.admin-input--select\s*\{[^}]*flex:\s*1 1/
    )
  })

  it('no celular, cada seletor ocupa a linha, para o texto da opção não ser cortado', () => {
    /**
     * Lado a lado a 390 px, "Todas as situações" saía cortada em "Todas as
     * situaçõ". No celular, cada seletor fica com a linha inteira.
     */
    const celular = consoleScss.slice(consoleScss.indexOf('@media (max-width: 520px)'))

    expect(consoleScss).toContain('@media (max-width: 520px)')
    expect(celular).toMatch(
      /\.admin-toolbar__actions \.admin-input--select\s*\{[^}]*flex-basis:\s*100%/
    )
  })
})
