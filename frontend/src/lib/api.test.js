import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, setApiAuthSession } from './api'

function respostaOk(corpo = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => corpo,
    text: async () => JSON.stringify(corpo),
  }
}

const chamada = () => global.fetch.mock.calls[0][1]

beforeEach(() => {
  setApiAuthSession({ accessToken: 'acesso-1', refreshToken: 'renovacao-1' })
  global.fetch = vi.fn().mockResolvedValue(respostaOk())
})

afterEach(() => {
  setApiAuthSession(null)
  vi.unstubAllGlobals()
})

describe('apiRequest — envio de arquivo', () => {
  it('manda o FormData como veio, sem serializar', async () => {
    const corpo = new FormData()
    corpo.append('arquivo', new File(['laudo'], 'laudo.pdf'))

    await apiRequest('/oportunidades/OP-2026-001/anexos/', {
      method: 'POST',
      body: corpo,
    })

    expect(chamada().body).toBe(corpo)
  })

  it('deixa o navegador definir o Content-Type do multipart', async () => {
    /**
     * O boundary é gerado pelo navegador e vai no cabeçalho. Definir
     * `multipart/form-data` à mão manda um Content-Type sem boundary, e o
     * servidor não consegue separar as partes.
     */
    await apiRequest('/oportunidades/OP-2026-001/anexos/', {
      method: 'POST',
      body: new FormData(),
    })

    expect(chamada().headers.has('Content-Type')).toBe(false)
  })

  it('continua mandando o token de acesso', async () => {
    await apiRequest('/oportunidades/OP-2026-001/anexos/', {
      method: 'POST',
      body: new FormData(),
    })

    expect(chamada().headers.get('Authorization')).toBe('Bearer acesso-1')
  })

  it('não muda o caminho do JSON', async () => {
    await apiRequest('/oportunidades/', { method: 'POST', body: { titulo: 'X' } })

    expect(chamada().headers.get('Content-Type')).toBe('application/json')
    expect(chamada().body).toBe(JSON.stringify({ titulo: 'X' }))
  })
})
