import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A tela de Permissoes, medida na fonte do SCSS.
 *
 * O quadro e os selos usavam variaveis que nao existem no projeto
 * (`--admin-card-bg`, `--admin-callout-*`). O navegador caia nas cores de
 * reserva, fixas e de tema claro: no escuro os selos viravam pilulas claras, a
 * tabela ficava sem cartao, e nada mudava pela tela de Aparencia. O aviso, a
 * tabela e as notas tambem ficavam colados. A guarda contra variavel que nao
 * existe vale para todas as folhas, em `variaveis.test.js`.
 *
 * No celular a tabela rola para o lado. A coluna da acao fica presa a esquerda
 * e uma dica avisa que ha mais perfis, porque em 390 px so cabia uma coluna e
 * nada dizia que existiam as outras tres.
 *
 * A tabela nao tem nada focavel dentro, entao e a area de rolagem que recebe o
 * foco de quem usa teclado, e o foco precisa aparecer. A letra segue a das
 * outras tabelas do console: era 1 px menor so nesta tela.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

const admin = readFileSync(join(RAIZ, 'pages/admin/AdminPage.scss'), 'utf8')
const consoleComum = readFileSync(join(RAIZ, 'styles/components/_console.scss'), 'utf8')

function bloco(seletor) {
  const inicio = admin.indexOf('\n' + seletor + ' {')

  if (inicio < 0) throw new Error('Nao achei a regra ' + seletor + ' em AdminPage.scss.')

  return admin.slice(inicio, admin.indexOf('\n}', inicio))
}

describe('tela de Permissões', () => {
  it('a tabela fica num cartão, como nas outras seções', () => {
    expect(bloco('.permissoes__rolagem')).toMatch(/background:\s*var\(--bg-card\)/)
  })

  it('o aviso, a tabela e as notas têm espaço entre si', () => {
    expect(bloco('.permissoes__aviso')).toMatch(/margin-bottom:\s*var\(--admin-gap\)/)
    expect(bloco('.permissoes__notas')).toMatch(/margin(-top)?:\s*var\(--admin-gap\)/)
  })

  it('cada termo da legenda começa no topo, mesmo ao lado de uma explicação mais longa', () => {
    expect(bloco('.permissoes__notas')).toMatch(/div\s*\{[^}]*align-content:\s*start/)
  })

  it('a coluna da ação fica presa à esquerda quando a tabela rola', () => {
    expect(bloco('.permissoes__tabela th:first-child')).toMatch(/position:\s*sticky/)
    expect(bloco('.permissoes__tabela th:first-child')).toMatch(/background:\s*var\(--bg-card\)/)
  })

  it('a tabela tem o mesmo tamanho de letra das outras tabelas do console', () => {
    const tamanho = /font-size:\s*([\d.]+rem)/
    const outras = consoleComum.slice(consoleComum.indexOf('\n.admin-table {'))

    expect(bloco('.permissoes__tabela').match(tamanho)[1]).toBe(outras.match(tamanho)[1])
  })

  it('o foco do teclado aparece na área que rola a tabela', () => {
    expect(bloco('.permissoes__rolagem:focus-visible')).toMatch(/outline:\s*2px solid var\(--accent-primary-text\)/)
  })

  it('a dica de rolagem só aparece na tela estreita', () => {
    expect(bloco('.permissoes__dica')).toMatch(/display:\s*none/)
    expect(admin).toMatch(/@media \(max-width: 760px\)\s*\{[^@]*\.permissoes__dica\s*\{[^}]*display:\s*block/)
  })
})
