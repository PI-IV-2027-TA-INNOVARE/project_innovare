import { afterEach, describe, expect, it, vi } from 'vitest'
import { tokenDeAcesso } from '../test/tokenDeAcesso'
import {
  apiRequest,
  baixarArquivo,
  configureApiAuth,
  getApiAuthSession,
  renovarSessao,
  setApiAuthSession,
} from './api'

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

  it('mostra a mensagem de validação sem o nome técnico do campo', async () => {
    responderCom(400, { email: ['Já existe uma conta com este e-mail.'] })

    const erro = await apiRequest('/usuarios/', { method: 'POST', body: {} }).catch((e) => e)

    expect(erro.message).toBe('Já existe uma conta com este e-mail.')
    expect(erro.data).toEqual({ email: ['Já existe uma conta com este e-mail.'] })
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

describe('baixarArquivo', () => {
  it('devolve o conteúdo e o nome que o servidor deu ao arquivo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('%PDF', {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': "attachment; filename*=UTF-8''laudo%20t%C3%A9cnico.pdf",
        },
      })
    ))

    const arquivo = await baixarArquivo('/oportunidades/OP-1/anexos/3/')

    expect(arquivo.nome).toBe('laudo técnico.pdf')
    expect(await arquivo.conteudo.text()).toBe('%PDF')
  })

  it('transforma a recusa do servidor em erro legível', async () => {
    responderCom(404, { detail: 'Documento não encontrado nesta oportunidade.' })

    await expect(baixarArquivo('/oportunidades/OP-1/anexos/9/')).rejects.toThrow(
      'Documento não encontrado nesta oportunidade.'
    )
  })
})

describe('renovação da sessão pelo cookie', () => {
  function respostaJson(status, corpo) {
    return new Response(JSON.stringify(corpo), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  afterEach(() => {
    setApiAuthSession(null)
  })

  it('pede a renovação com o cookie e sem token no corpo', async () => {
    const fetch = vi.fn().mockResolvedValue(respostaJson(200, { access: 'acesso-novo' }))
    vi.stubGlobal('fetch', fetch)

    const sessao = await renovarSessao()

    const [url, init] = fetch.mock.calls[0]
    expect(url).toMatch(/\/auth\/token\/refresh\/$/)
    expect(init.credentials).toBe('include')
    expect(init.body).toBe('{}')
    expect(sessao).toEqual({ accessToken: 'acesso-novo' })
    expect(getApiAuthSession()).toEqual({ accessToken: 'acesso-novo' })
  })

  it('acesso vencido é renovado pelo cookie e o pedido é refeito', async () => {
    setApiAuthSession({ accessToken: 'vencido' })
    const fetch = vi.fn()
      .mockResolvedValueOnce(respostaJson(401, { detail: 'token_not_valid' }))
      .mockResolvedValueOnce(respostaJson(200, { access: 'acesso-novo' }))
      .mockResolvedValueOnce(respostaJson(200, { ok: true }))
    vi.stubGlobal('fetch', fetch)

    await expect(apiRequest('/oportunidades/')).resolves.toEqual({ ok: true })

    expect(fetch.mock.calls[2][1].headers.get('Authorization')).toBe('Bearer acesso-novo')
  })
})

describe('outra conta entrou neste navegador', () => {
  function respostaJson(status, corpo) {
    return new Response(JSON.stringify(corpo), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  function renovacaoQueDevolve(token, depois = []) {
    const fetch = vi.fn()
      .mockResolvedValueOnce(respostaJson(401, { detail: 'token_not_valid' }))
      .mockResolvedValueOnce(respostaJson(200, { access: token }))

    for (const resposta of depois) fetch.mockResolvedValueOnce(resposta)

    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  afterEach(() => {
    setApiAuthSession(null)
    configureApiAuth()
  })

  it('a renovação que traz outra conta não refaz o pedido em nome dela', async () => {
    setApiAuthSession({ accessToken: tokenDeAcesso(7) })
    const fetch = renovacaoQueDevolve(tokenDeAcesso(9), [respostaJson(201, { ok: true })])

    const erro = await apiRequest('/oportunidades/5/decisao/', { method: 'POST', body: {} })
      .catch((problema) => problema)

    expect(erro.data).toEqual({ codigo: 'conta_trocada' })
    expect(erro.message).toMatch(/outra conta entrou neste navegador/i)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('a renovação da mesma conta refaz o pedido como antes', async () => {
    setApiAuthSession({ accessToken: tokenDeAcesso(7, 'a') })
    const fetch = renovacaoQueDevolve(tokenDeAcesso(7, 'b'), [respostaJson(200, { ok: true })])

    await expect(apiRequest('/oportunidades/')).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('o download também não é refeito em nome de outra conta', async () => {
    setApiAuthSession({ accessToken: tokenDeAcesso(7) })
    const fetch = renovacaoQueDevolve(tokenDeAcesso(9), [
      new Response('conteudo', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    ])

    const erro = await baixarArquivo('/oportunidades/5/anexos/1/conteudo/').catch((problema) => problema)

    expect(erro.data).toEqual({ codigo: 'conta_trocada' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('quem acompanha a sessão fica sabendo que a conta mudou', async () => {
    const aoRenovar = vi.fn()
    configureApiAuth({ onSessionRefresh: aoRenovar })
    setApiAuthSession({ accessToken: tokenDeAcesso(7) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaJson(200, { access: tokenDeAcesso(9) })))

    await renovarSessao()

    expect(aoRenovar).toHaveBeenCalledWith(
      { accessToken: tokenDeAcesso(9) },
      { contaTrocada: true }
    )
  })

  it('retomar a sessão ao recarregar a página não conta como troca', async () => {
    const aoRenovar = vi.fn()
    configureApiAuth({ onSessionRefresh: aoRenovar })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaJson(200, { access: tokenDeAcesso(9) })))

    await renovarSessao()

    expect(aoRenovar).toHaveBeenCalledWith(
      { accessToken: tokenDeAcesso(9) },
      { contaTrocada: false }
    )
  })
})
