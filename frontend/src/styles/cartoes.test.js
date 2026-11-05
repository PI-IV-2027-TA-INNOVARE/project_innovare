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

/**
 * Os cartoes do perfil ficam com a mesma altura, a pedido do usuario: lado a
 * lado, um cartao mais baixo que o vizinho parecia sobra. Vale para os de
 * conta (Senha e Meus dados) e para os seis do perfil profissional. A
 * "Formacao academica", que motivou a regra de cima, e um cartao largo fora
 * dessa grade.
 *
 * Para o mais baixo nao virar um cartao com o pe vazio, o conteudo usa o
 * espaco: em Meus dados a exclusao desce para o pe do cartao, na Senha as
 * regras vao para o lado dos campos quando o cartao e largo, e o Contato do
 * Demandante, que e um campo so, vira uma faixa na largura toda.
 */
describe('cartões do perfil', () => {
  const perfil = fonte('../pages/app/perfil/PerfilPage.scss')

  function bloco(seletor) {
    const inicio = perfil.indexOf('\n' + seletor + ' {')

    expect(inicio, seletor).toBeGreaterThanOrEqual(0)

    return perfil.slice(inicio, perfil.indexOf('\n}', inicio))
  }

  it('os de conta têm a mesma altura, em duas colunas', () => {
    expect(bloco('.perfil-grid')).toMatch(/cartoes-em-grade\(2\)/)
    expect(bloco('.perfil-grid')).not.toMatch(/\$altura-igual:\s*false/)
  })

  it('os seis do perfil profissional têm a mesma altura', () => {
    expect(bloco('.perfil-grupo__grid')).toMatch(/cartoes-em-grade\(3\)/)
    expect(bloco('.perfil-grupo__grid')).not.toMatch(/\$altura-igual:\s*false/)
  })

  it('o Contato do Demandante ocupa a linha inteira, com título e campo lado a lado', () => {
    const faixa = bloco('.perfil-card--faixa')

    expect(faixa).toMatch(/display:\s*flex/)
    expect(faixa).toMatch(/flex-wrap:\s*wrap/)
  })

  it('em Meus dados, a exclusão fica no pé do cartão esticado', () => {
    expect(perfil).toMatch(
      /\.perfil-grid > \.perfil-card--meus-dados > \.perfil-card__body\s*\{[^}]*align-content:\s*stretch/
    )
    expect(perfil).toMatch(/&--exclusao\s*\{[^}]*margin-top:\s*auto/)
  })

  it('a descrição usa a largura do cartão, sem quebrar no meio dele', () => {
    expect(perfil).toMatch(/\.perfil-page \.perfil-card__description\s*\{[^}]*max-width:\s*none/)
  })

  it('na Senha, as regras vão para o lado dos campos quando o cartão é largo', () => {
    expect(perfil).toMatch(
      /@container senha[^{]*\{[\s\S]*?\.regras-da-senha\s*\{[^}]*grid-column:\s*2/
    )
  })

  it('o quadro das regras começa na altura do campo, e não do rótulo', () => {
    /**
     * O rotulo do campo tem altura de uma linha, e o campo vem 6 px abaixo
     * dele (o `gap` de `.admin-field`). A altura da linha do rotulo e fixada
     * aqui para o deslocamento do quadro ser exato.
     */
    expect(perfil).toMatch(
      /@container senha[^{]*\{[\s\S]*?\.admin-field__label\s*\{[^}]*line-height:\s*1\.5/
    )
    expect(perfil).toMatch(
      /@container senha[^{]*\{[\s\S]*?\.regras-da-senha\s*\{[^}]*margin-top:\s*calc\(0\.875rem \* 1\.5 \+ 6px\)/
    )
  })
})

describe('regras da senha na redefinição', () => {
  it('ficam junto do campo da nova senha, e não soltas entre os dois campos', () => {
    const redefinicao = fonte('../pages/auth/reset-password/ResetPasswordPage.scss')

    expect(redefinicao).toMatch(/> \.form-group\s*\{[^}]*margin-bottom:\s*0/)
    expect(redefinicao).toMatch(/> \.regras-da-senha\s*\{[^}]*margin-top:\s*-8px/)
  })
})
