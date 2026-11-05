import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * O breadcrumb do topo das paginas ("AC2 Microbiologia · Minha conta") aparece
 * na Administracao, no Meu Perfil, na Rede interna, em Oportunidades e em
 * Problemas, mas o estilo morava no SCSS da Administracao, que so carrega
 * quando ela e aberta. Quem chegava direto a outra pagina via o breadcrumb
 * grande, sem as maiusculas e sem a cor de apoio. No SCSS do console, que
 * entra pelo `styles/index.scss`, ele vale para todas.
 */

function fonte(caminho) {
  return readFileSync(fileURLToPath(new URL(caminho, import.meta.url)), 'utf8')
}

const console_ = fonte('./components/_console.scss')
const admin = fonte('../pages/admin/AdminPage.scss')

function declaracoesProprias(scss, seletor) {
  const inicio = scss.indexOf('\n' + seletor + ' {')

  if (inicio < 0) throw new Error('Nao achei a regra ' + seletor + '.')

  const corpo = scss.slice(inicio, scss.indexOf('\n}', inicio))

  return corpo.slice(corpo.indexOf('{') + 1).replace(/[^;{}]*\{[^{}]*\}/g, '')
}

describe('breadcrumb do topo das páginas', () => {
  it('mora no CSS comum do console, e não no da Administração', () => {
    expect(console_).toContain('\n.admin-page__breadcrumb {')
    expect(admin).not.toContain('.admin-page__breadcrumb')
  })

  it('mantém as maiúsculas e a cor de apoio, sem perder contraste por opacidade', () => {
    const regra = declaracoesProprias(console_, '.admin-page__breadcrumb')

    expect(regra).toMatch(/text-transform:\s*uppercase/)
    expect(regra).toMatch(/color:\s*var\(--text-muted\)/)
    expect(regra).not.toMatch(/opacity:\s*0?\.\d/)
  })
})
