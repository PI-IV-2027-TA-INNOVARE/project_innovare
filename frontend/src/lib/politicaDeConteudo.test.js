import { describe, expect, it } from 'vitest'
import { politicaDeConteudo } from './politicaDeConteudo'

const diretiva = (politica, nome) =>
  politica.split('; ').find((item) => item.startsWith(`${nome} `))

describe('política de conteúdo do build', () => {
  it('só roda script do próprio site', () => {
    const politica = politicaDeConteudo('/api')

    expect(diretiva(politica, 'script-src')).toBe("script-src 'self'")
    expect(diretiva(politica, 'object-src')).toBe("object-src 'none'")
    expect(diretiva(politica, 'base-uri')).toBe("base-uri 'self'")
  })

  it('libera a API em outro endereço só para conexão', () => {
    const politica = politicaDeConteudo('https://api.pdconnect.example/api')

    expect(diretiva(politica, 'connect-src')).toBe(
      "connect-src 'self' https://api.pdconnect.example"
    )
    expect(diretiva(politica, 'script-src')).not.toContain('api.pdconnect.example')
  })

  it('com a API no mesmo site, a conexão fica no próprio site', () => {
    expect(diretiva(politicaDeConteudo('/api'), 'connect-src')).toBe("connect-src 'self'")
  })

  it('aceita as fontes do Google que a página carrega', () => {
    const politica = politicaDeConteudo('/api')

    expect(diretiva(politica, 'style-src')).toContain('https://fonts.googleapis.com')
    expect(diretiva(politica, 'font-src')).toContain('https://fonts.gstatic.com')
  })
})
