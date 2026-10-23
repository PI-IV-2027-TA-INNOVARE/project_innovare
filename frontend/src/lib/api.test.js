import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './api'

function responderCom(status, corpo) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(corpo), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  ))
}

function responderComTexto(status, corpo, tipo = 'text/html; charset=utf-8') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(corpo, { status, headers: { 'Content-Type': tipo } })
  ))
}

const PAGINA_DE_DEBUG_DO_DJANGO = `<!DOCTYPE html>
<html lang="en"><head><title>ProgrammingError at /api/auth/token/</title></head>
<body><h1>ProgrammingError at /api/auth/token/</h1>
<pre class="exception_value">relation "Usuario" does not exist</pre></body></html>`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiRequest', () => {
  it('usa o texto do detail como mensagem, sem o nome da chave', async () => {
    responderCom(403, { detail: 'Seu perfil nao tem competencia para esta acao.' })

    await expect(apiRequest('/usuarios/')).rejects.toThrow(
      /^Seu perfil nao tem competencia para esta acao\.$/
    )
  })

  it('deixa o codigo de maquina fora da mensagem', async () => {
    responderCom(409, {
      detail: 'Esta oportunidade ainda nao tem proposta estruturada.',
      codigo: 'proposta_inexistente',
    })

    const erro = await apiRequest('/oportunidades/OP-1/relatorio/').catch((e) => e)

    expect(erro.message).toBe('Esta oportunidade ainda nao tem proposta estruturada.')
    expect(erro.data.codigo).toBe('proposta_inexistente')
  })

  it('mantem o campo na frente das mensagens de validacao', async () => {
    responderCom(400, { email: ['Ja existe uma conta com este e-mail.'] })

    await expect(apiRequest('/usuarios/', { method: 'POST', body: {} })).rejects.toThrow(
      'email: Ja existe uma conta com este e-mail.'
    )
  })

  /**
   * A pagina de debug do Django chegou inteira ao banner do login: o corpo que
   * nao e JSON virava `detail` e a mensagem do erro era o HTML. Corpo que nao
   * e JSON nunca e mensagem - nem `data`, porque ha tela que le `data.detail`
   * antes de `message`.
   */
  it('nunca mostra a pagina HTML de erro do servidor', async () => {
    responderComTexto(500, PAGINA_DE_DEBUG_DO_DJANGO)

    const erro = await apiRequest('/auth/token/', { method: 'POST', body: {} }).catch((e) => e)

    expect(erro.status).toBe(500)
    expect(erro.message).toBe(
      'O servidor encontrou um erro inesperado. Tente novamente em instantes; se continuar, avise o suporte.'
    )
    expect(erro.message).not.toContain('<')
    expect(erro.data).toBeNull()
  })

  it('texto puro de erro, como o de um proxy, tambem nao vira mensagem', async () => {
    responderComTexto(502, 'Bad Gateway', 'text/plain')

    const erro = await apiRequest('/oportunidades/').catch((e) => e)

    expect(erro.message).not.toContain('Bad Gateway')
    expect(erro.data).toBeNull()
  })

  it('erro 4xx fora do JSON cai na mensagem padrao', async () => {
    responderComTexto(404, '<h1>Not Found</h1>')

    const erro = await apiRequest('/rota-inexistente/').catch((e) => e)

    expect(erro.status).toBe(404)
    expect(erro.message).not.toContain('<')
  })

  it('erro 500 em JSON mostra o detail que a API escreveu', async () => {
    responderCom(500, {
      detail: 'O servidor encontrou um erro inesperado. Tente novamente em instantes.',
      codigo: 'erro_interno',
    })

    const erro = await apiRequest('/oportunidades/').catch((e) => e)

    expect(erro.message).toBe(
      'O servidor encontrou um erro inesperado. Tente novamente em instantes.'
    )
    expect(erro.data.codigo).toBe('erro_interno')
  })

  it('JSON malformado nao estoura erro de parse na tela', async () => {
    responderComTexto(500, '{"detail": ', 'application/json')

    const erro = await apiRequest('/oportunidades/').catch((e) => e)

    expect(erro.status).toBe(500)
    expect(erro.message).not.toMatch(/JSON|Unexpected/)
  })

  it('servidor fora do ar vira mensagem legivel em vez de "Failed to fetch"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const erro = await apiRequest('/auth/token/', { method: 'POST', body: {} }).catch((e) => e)

    expect(erro.name).toBe('ApiError')
    expect(erro.status).toBe(0)
    expect(erro.message).toBe(
      'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.'
    )
  })

  it('cancelamento da requisicao continua sendo cancelamento', async () => {
    const cancelamento = new DOMException('The operation was aborted.', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cancelamento))

    await expect(apiRequest('/oportunidades/')).rejects.toBe(cancelamento)
  })
})
