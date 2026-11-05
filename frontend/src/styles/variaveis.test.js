import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Toda variavel CSS usada nas folhas precisa existir.
 *
 * Variavel que nao existe nao da erro: o navegador cai na reserva do `var()`,
 * quando ha uma, ou em nada. Foi assim que a Permissoes e a Saude ficaram sem
 * fundo de cartao e com selos em cores fixas de tema claro, que nem o tema
 * escuro nem a tela de Aparencia alcancavam. Contam como definidas as
 * variaveis declaradas nas folhas e as que o codigo escreve em tempo de
 * execucao: a paleta do `brandTokens.js` e os estilos inline.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const arquivos = readdirSync(RAIZ, { recursive: true })
const ler = (arquivo) => readFileSync(join(RAIZ, arquivo), 'utf8')

const folhas = arquivos.filter((arquivo) => arquivo.endsWith('.scss'))
const codigo = arquivos.filter((arquivo) => /\.jsx?$/.test(arquivo) && !/\.test\.jsx?$/.test(arquivo))

const definidas = new Set(
  [
    ...folhas.flatMap((arquivo) => [...ler(arquivo).matchAll(/(--[a-z0-9-]+)\s*:/gi)]),
    ...codigo.flatMap((arquivo) => [...ler(arquivo).matchAll(/['"`](--[a-z0-9-]+)['"`]/g)]),
  ].map((achado) => achado[1])
)

describe('variáveis CSS', () => {
  it('nenhuma folha usa variável que não existe', () => {
    const faltando = folhas.flatMap((arquivo) =>
      [...new Set([...ler(arquivo).matchAll(/var\((--[a-z0-9-]+)/gi)].map((achado) => achado[1]))]
        .filter((nome) => !definidas.has(nome))
        .map((nome) => `${arquivo}: ${nome}`)
    )

    expect(faltando).toEqual([])
  })
})
