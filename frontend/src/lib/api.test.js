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
})
