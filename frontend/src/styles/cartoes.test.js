import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Altura dos cartoes nos formularios, medida na fonte do SCSS.
 *
 * A grade de cartoes alinha cabecalho e corpo de todos os cartoes da mesma
 * linha, e o cartao com pouco conteudo estica ate a altura do vizinho. Num
 * formulario isso deixava "Formacao academica" quase vazio e do tamanho do
 * cartao de competencias. Nos formularios, cada cartao fica com a altura do
 * proprio conteudo.
 */

function fonte(caminho) {
  return readFileSync(fileURLToPath(new URL(caminho, import.meta.url)), 'utf8')
}

const FORMULARIOS = [
  ['./components/_console.scss', '.console-form'],
  ['../pages/app/perfil/PerfilPage.scss', '.perfil-grid'],
  ['../pages/app/perfil/PerfilPage.scss', '.perfil-grupo__grid'],
]

describe('cartões dos formulários', () => {
  it.each(FORMULARIOS)('%s %s não estica o cartão até a altura do vizinho', (arquivo, seletor) => {
    const scss = fonte(arquivo)
    const inicio = scss.indexOf('\n' + seletor + ' {')
    const bloco = scss.slice(inicio, scss.indexOf('\n}', inicio))

    expect(inicio).toBeGreaterThanOrEqual(0)
    expect(bloco).toMatch(/cartoes-em-grade\(\d,\s*\$altura-igual:\s*false\)/)
  })
})
