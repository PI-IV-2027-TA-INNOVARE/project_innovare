import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * L8 (LGPD): a fonte Inter vai junto com o front.
 *
 * O `index.html` pedia a fonte aos servidores do Google, e cada visita
 * entregava o IP da pessoa a eles sem aviso. Agora os arquivos ficam em
 * `public/fonts/inter`, com a licença SIL OFL ao lado, e o `@font-face`
 * aponta para eles.
 */

function caminho(relativo) {
  return fileURLToPath(new URL(relativo, import.meta.url))
}

function fonte(relativo) {
  return readFileSync(caminho(relativo), 'utf8')
}

describe('fonte da interface', () => {
  it('o index.html não pede nada aos servidores de fonte do Google', () => {
    const indice = fonte('../../index.html')

    expect(indice).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
  })

  it('o @font-face da Inter aponta para arquivos que existem no projeto', () => {
    const scss = fonte('./base/_fontes.scss')
    const arquivos = [...scss.matchAll(/url\('([^']+\.woff2)'\)/g)].map((achado) => achado[1])

    expect(scss).toMatch(/font-family:\s*'Inter'/)
    expect(arquivos.length).toBeGreaterThan(0)
    arquivos.forEach((arquivo) => {
      expect(existsSync(caminho(`../../public${arquivo}`)), arquivo).toBe(true)
    })
  })

  it('a licença da fonte vai junto com os arquivos', () => {
    expect(existsSync(caminho('../../public/fonts/inter/OFL.txt'))).toBe(true)
  })

  it('os estilos carregam o @font-face', () => {
    expect(fonte('./index.scss')).toMatch(/@use 'base\/fontes';/)
  })
})
