import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Layout, foco e contraste da tela Aparencia, medidos na fonte do SCSS.
 *
 * Os grupos de cores ficavam em grade de duas colunas num monitor largo. Como
 * so o primeiro grupo nasce aberto, a coluna dos grupos recolhidos sobrava
 * vazia ao lado dele. Empilhados, cada grupo usa a largura toda - e uma grade
 * de cartoes dentro dele sobrava pela metade, porque os grupos tem de duas a
 * quatro cores. Por isso cada cor ocupa uma linha: amostra, nome, valor e
 * estado ("personalizada" e "Desfazer"), com o estado numa coluna propria para
 * todas as linhas terem a mesma altura. Em grupo medio o estado desce para
 * baixo do valor; em grupo estreito tudo empilha ao lado da amostra.
 *
 * A coluna do valor precisa encolher abaixo da largura natural do campo hex,
 * uns 170 px; sem isso o botao de copiar sai cortado.
 *
 * O cabecalho de cada grupo traz a descricao e uma amostra de cada cor, para o
 * grupo recolhido dizer o que guarda sem precisar abrir. A amostra tem contorno
 * porque a cor pode ser clara ou translucida como o proprio cartao. Em grupo
 * estreito as amostras descem para baixo da descricao; ao lado do titulo elas
 * o espremeriam contra a contagem.
 *
 * O `<input type="color">` da amostra e transparente por cima dela, entao o
 * contorno de foco desenhado nele some junto: o foco do teclado aparece como
 * anel na propria amostra. O anel e duplo, laranja e cor do cartao, porque a
 * amostra pode ser justamente da cor do anel.
 *
 * A amostra da cor translucida mostra a cor como ela aparece na plataforma: o
 * veu sobre o fundo do cartao. Xadrez, ou amostra metade cheia e metade xadrez,
 * e convencao de editor de imagem; aqui parecia defeito de tela, e o admin quer
 * ver o resultado, nao a transparencia. A opacidade vai escrita embaixo do
 * valor, porque o seletor de cor abre na cor cheia e a amostra mostra o veu.
 * A amostra tem contorno porque algumas cores sao o proprio fundo da linha: o
 * Fundo secundario e a cor da linha nos dois temas, e sem contorno a amostra
 * dele parecia um espaco vazio.
 *
 * Os textos de apoio usavam `--text-muted` com `opacity: .8`. No tema claro
 * isso chega ao olho a 3,70:1 sobre o cartao, abaixo dos 4,5:1 da WCAG 2.2 AA;
 * sem a opacidade, o mesmo token da 5,67:1.
 */

function fonte(caminho) {
  return readFileSync(fileURLToPath(new URL(caminho, import.meta.url)), 'utf8')
}

const admin = fonte('../pages/admin/AdminPage.scss')

function bloco(seletor) {
  const inicio = admin.indexOf('\n' + seletor + ' {')

  if (inicio < 0) throw new Error('Nao achei a regra ' + seletor + ' em AdminPage.scss.')

  const fim = admin.indexOf('\n}', inicio)
  return admin.slice(inicio, fim)
}

function declaracoesProprias(seletor) {
  const corpo = bloco(seletor)
  return corpo.slice(corpo.indexOf('{') + 1).replace(/[^;{}]*\{[^{}]*\}/g, '')
}

describe('tela Aparência', () => {
  it('empilha os grupos de cores, sem coluna vazia ao lado do grupo aberto', () => {
    expect(bloco('.appearance-groups')).not.toMatch(/auto-fit|auto-fill/)
  })

  it('"personalizada" e "Desfazer" quebram a linha em vez de cortar o que não cabe', () => {
    expect(bloco('.token-card__estado')).toMatch(/flex-wrap:\s*wrap/)
  })

  it('cada cor ocupa uma linha inteira do grupo, com o estado numa coluna própria', () => {
    expect(bloco('.tokens-group__lista')).not.toMatch(/auto-fill|auto-fit|repeat\(/)
    expect(bloco('.token-card')).toMatch(/grid-template-areas:\s*'amostra info valor estado'/)
  })

  it('em grupo médio o estado desce para baixo do valor, e no estreito tudo empilha', () => {
    expect(bloco('.tokens-group__lista')).toMatch(/container-type:\s*inline-size/)
    expect(admin).toMatch(
      /@container[^{]*\{[\s\S]*?grid-template-areas:\s*'amostra info valor'\s*'amostra info estado'/
    )
    expect(admin).toMatch(
      /@container[^{]*\{[\s\S]*?grid-template-areas:\s*'amostra info'\s*'amostra valor'\s*'amostra estado'/
    )
  })

  it('a amostra do cabeçalho tem contorno, para cor clara não sumir no cartão', () => {
    expect(bloco('.tokens-group__amostra')).toMatch(/box-shadow:\s*inset/)
  })

  it('em grupo estreito as amostras do cabeçalho descem para baixo da descrição', () => {
    expect(bloco('.tokens-group')).toMatch(/container:\s*grupo\s*\/\s*inline-size/)
    expect(admin).toMatch(
      /@container grupo[^{]*\{[\s\S]*?\.tokens-group__amostras\s*\{[^}]*grid-row:\s*2/
    )
  })

  it('a coluna do valor encolhe sem cortar o botão de copiar', () => {
    expect(bloco('.token-card__valor')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  })

  it('mostra o foco do teclado na amostra, já que o seletor de cor é invisível', () => {
    const anel = bloco('.token-card__swatch').match(
      /&:has\(input\[type='color'\]:focus-visible\)[^{]*\{([^}]*)\}/
    )

    expect(anel).not.toBeNull()
    expect(anel[1]).toMatch(/var\(--accent-primary\)/)
    expect(anel[1]).toMatch(/var\(--bg-card\)/)
  })

  it('a amostra tem contorno, para a cor igual ao fundo da linha não sumir', () => {
    expect(declaracoesProprias('.token-card__swatch-fill')).toMatch(/box-shadow:\s*inset 0 0 0 1px/)
  })

  it('a amostra mostra a cor translúcida como ela aparece, sobre o fundo do cartão', () => {
    expect(declaracoesProprias('.token-card__swatch')).toMatch(/background:\s*var\(--bg-card\)/)
    expect(declaracoesProprias('.token-card__swatch-fill')).not.toMatch(/background/)
    expect(admin).not.toMatch(/conic-gradient|--amostra-opaca/)
  })

  it('marca no próprio campo a cor recusada', () => {
    expect(bloco('.token-card__hex')).toMatch(
      /&\[aria-invalid='true'\]\s*\{[^}]*border-color:\s*var\(--accent-error\)/
    )
  })

  it.each([
    '.admin-nav__description',
    '.appearance-toolbar__count',
    '.tokens-group__description',
    '.token-card__hint',
    '.token-card__opacidade',
    '.exemplo-de-estados__titulo',
  ])('%s não perde contraste por opacidade', (seletor) => {
    expect(declaracoesProprias(seletor)).not.toMatch(/opacity:\s*0?\.\d/)
  })
})
