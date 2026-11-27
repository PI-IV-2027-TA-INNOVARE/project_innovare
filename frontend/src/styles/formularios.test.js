import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const aqui = dirname(fileURLToPath(import.meta.url))

const consoleScss = readFileSync(join(aqui, 'components', '_console.scss'), 'utf8')

const formularios = ['oportunidades/IdeiaFormPage.jsx', 'problemas/ProblemaFormPage.jsx', 'rede/RedeFormPage.jsx']

/**
 * A frase "Campos com * são obrigatórios." dos formularios usava o estilo da
 * tela de Oportunidades. Quem nao abria essa tela antes, como o Demandante,
 * via a frase sem estilo: maior e mais escura que o texto em volta.
 */
describe('legenda dos formulários', () => {
  it('o estilo da legenda fica no estilo comum do console', () => {
    expect(consoleScss).toMatch(
      /\n\.console-form__legenda \{[^}]*font-size:\s*0\.8125rem;[^}]*color:\s*var\(--text-muted\);/
    )
  })

  it.each(formularios)('%s usa a legenda comum', (caminho) => {
    const fonte = readFileSync(join(aqui, '..', 'pages', 'app', ...caminho.split('/')), 'utf8')

    expect(fonte).toContain('className="console-form__legenda"')
    expect(fonte).not.toContain('proposta__legenda')
  })
})

/**
 * O aviso de erro do envio fica entre os cartoes e o rodape do formulario.
 * Na grade de duas colunas, ocupava so meia linha.
 */
describe('aviso dentro do formulário', () => {
  it('ocupa a largura toda da grade', () => {
    expect(consoleScss).toMatch(/\n\.console-form > \.admin-callout \{[^}]*grid-column:\s*1 \/ -1;/)
  })
})
