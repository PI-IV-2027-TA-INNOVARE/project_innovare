import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A secao Saude, medida na fonte do SCSS.
 *
 * Os quatro blocos da secao (consumo, verificacoes, revisao e detalhes) pediam
 * um fundo de cartao que nao existia e ficavam transparentes, soltos no fundo
 * da pagina. O aviso da tabela de provedores usava cores fixas de tema claro e
 * agora usa a cor de Alerta; o contraste dele esta em `contraste.test.js`.
 *
 * Os estados seguem as cores de estado da paleta: atencao em Alerta e critico
 * em Erro. Antes os dois usavam o laranja da marca no selo e na barra, e o
 * critico so ficava vermelho no cartao da verificacao. No celular, a coluna do
 * provedor fica presa quando a tabela rola, e uma dica avisa que ha mais colunas.
 */

const admin = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'admin', 'AdminPage.scss'),
  'utf8'
)

function bloco(seletor) {
  const inicio = admin.indexOf('\n' + seletor + ' {')

  if (inicio < 0) throw new Error('Nao achei a regra ' + seletor + ' em AdminPage.scss.')

  return admin.slice(inicio, admin.indexOf('\n}', inicio))
}

describe('seção Saúde', () => {
  it('os quatro blocos da seção ficam em cartão, como nas outras seções', () => {
    expect(admin).toMatch(/\.saude__consumo,\s*\.saude__verificacoes,\s*\.saude__revisao,\s*\.saude__detalhes \{/)
    expect(bloco('.saude__detalhes')).toMatch(/background:\s*var\(--bg-card\)/)
  })

  it('atenção usa a cor de Alerta no selo, na barra, no cartão e na lista de achados', () => {
    expect(bloco('.saude__selo')).toMatch(/&--atencao\s*\{[^}]*color:\s*var\(--accent-warning\)/)
    expect(bloco('.saude__barra--atencao .saude__barra-preenchida')).toMatch(/background:\s*var\(--accent-warning\)/)
    expect(bloco('.saude__verificacao')).toMatch(/&--atencao\s*\{[^}]*border-left-color:\s*var\(--accent-warning\)/)
    expect(bloco('.saude__verificacao--atencao .saude__verificacao-resposta svg')).toMatch(/color:\s*var\(--accent-warning\)/)
    expect(bloco('.saude__achados')).toMatch(/border:\s*1px solid color-mix\(in srgb, var\(--accent-warning\)/)
  })

  it('crítico usa a cor de Erro no selo e na barra, como já fazia no cartão', () => {
    expect(bloco('.saude__selo')).toMatch(/&--critico\s*\{[^}]*background:\s*var\(--accent-error\)/)
    expect(bloco('.saude__barra--critico .saude__barra-preenchida')).toMatch(/background:\s*var\(--accent-error\)/)
  })

  it('nenhum estado da Saúde usa o laranja da marca', () => {
    const estados = [
      bloco('.saude__selo'),
      bloco('.saude__achados'),
      bloco('.saude__verificacao'),
      bloco('.saude__barra--atencao .saude__barra-preenchida'),
      bloco('.saude__verificacao--atencao .saude__verificacao-resposta svg'),
    ].join('\n')

    expect(estados).not.toMatch(/accent-primary|border-accent/)
  })

  it('a coluna do provedor fica presa quando a tabela rola, e a dica só aparece na tela estreita', () => {
    expect(bloco('.saude__tabela th:first-child')).toMatch(/position:\s*sticky/)
    expect(bloco('.saude__tabela th:first-child')).toMatch(/background:\s*var\(--bg-card\)/)
    expect(bloco('.saude__dica')).toMatch(/display:\s*none/)
    expect(admin).toMatch(/@media \(max-width: 760px\)\s*\{[^@]*\.saude__dica\s*\{[^}]*display:\s*block/)
  })
})
