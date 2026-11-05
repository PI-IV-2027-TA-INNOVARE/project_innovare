import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A tabela de usuarios no celular, medida na fonte do SCSS.
 *
 * Abaixo de 760 px cada linha vira um cartao, e cada celula, uma grade de
 * rotulo e valor. Item de grade estica ate a largura da coluna e nao encolhe
 * abaixo do proprio conteudo: os selos de perfil e situacao viravam faixas da
 * largura toda, e o e-mail, que nao tem onde quebrar, passava da borda do
 * cartao. O texto do pedido de exclusao caia na coluna estreita do rotulo.
 */

function fonte(caminho) {
  return readFileSync(fileURLToPath(new URL(caminho, import.meta.url)), 'utf8')
}

const console_ = fonte('./components/_console.scss')

function blocoDoCelular() {
  const inicio = console_.indexOf('@media (max-width: 760px) {')

  if (inicio < 0) throw new Error('Nao achei o @media (max-width: 760px) em _console.scss.')

  let profundidade = 0

  for (let i = console_.indexOf('{', inicio); i < console_.length; i += 1) {
    if (console_[i] === '{') profundidade += 1
    if (console_[i] === '}') profundidade -= 1
    if (profundidade === 0) return console_.slice(inicio, i + 1)
  }

  throw new Error('O @media (max-width: 760px) nao fecha.')
}

const celular = blocoDoCelular()

describe('tabela de usuários no celular', () => {
  it('o e-mail quebra a linha em vez de passar da borda do cartão', () => {
    expect(celular).toMatch(/\.user-cell__email\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })

  it('os selos ficam do tamanho do texto, sem esticar até a borda', () => {
    expect(celular).toMatch(/\n\s*td\s*\{[^}]*justify-items:\s*start/)
  })

  it('o texto do pedido de exclusão fica na coluna dos valores, embaixo da situação', () => {
    expect(celular).toMatch(/\.user-cell__pedido\s*\{[^}]*grid-column:\s*2/)
  })
})
