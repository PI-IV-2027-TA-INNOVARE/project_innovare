import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = resolve(process.cwd(), 'src')

const EXTENSOES = ['.js', '.jsx']

const SENHAS_CONHECIDAS = [
  'admin123',
  'supervisor123',
  'pesquisador123',
  'demandante123',
]

function fontes(diretorio = RAIZ, encontrados = []) {
  for (const entrada of readdirSync(diretorio, { withFileTypes: true })) {
    const caminho = join(diretorio, entrada.name)

    if (entrada.isDirectory()) fontes(caminho, encontrados)
    else if (EXTENSOES.some((ext) => entrada.name.endsWith(ext))) {
      encontrados.push(caminho)
    }
  }

  return encontrados
}

describe('o fonte do front nao carrega credencial', () => {
  it('nenhuma senha de atalho sobrevive no fonte', () => {
    const vazamentos = fontes()
      .filter((caminho) => !caminho.endsWith('semCredenciaisNoFonte.test.js'))
      .flatMap((caminho) => {
        const conteudo = readFileSync(caminho, 'utf8')

        return SENHAS_CONHECIDAS.filter((senha) => conteudo.includes(senha)).map(
          (senha) => `${caminho.replace(RAIZ, 'src')}: ${senha}`
        )
      })

    expect(vazamentos).toEqual([])
  })

  it('nao existe caminho de autenticacao que dispense a API', () => {
    const suspeitos = fontes().filter((caminho) =>
      /mockAuth|fakeAuth|authMock/i.test(caminho)
    )

    expect(suspeitos).toEqual([])
  })
})
