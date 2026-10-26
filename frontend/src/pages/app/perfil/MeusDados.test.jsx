import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MeusDados from './MeusDados'

const api = vi.hoisted(() => ({
  baixarMeusDados: null,
  obterPedidoDeExclusao: null,
  pedirExclusaoDaConta: null,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  baixarMeusDados: (...args) => api.baixarMeusDados(...args),
  obterPedidoDeExclusao: (...args) => api.obterPedidoDeExclusao(...args),
  pedirExclusaoDaConta: (...args) => api.pedirExclusaoDaConta(...args),
}))

const salvar = vi.hoisted(() => vi.fn())

vi.mock('../../../lib/anexos', async (original) => ({
  ...(await original()),
  salvarNoComputador: salvar,
}))

beforeEach(() => {
  salvar.mockReset()
  api.baixarMeusDados = vi.fn().mockResolvedValue({ conteudo: new Blob(['{}']), nome: 'meus-dados.json' })
  api.obterPedidoDeExclusao = vi.fn().mockResolvedValue({ solicitada_em: null })
  api.pedirExclusaoDaConta = vi.fn().mockResolvedValue({ solicitada_em: '2026-10-24T15:00:00Z' })
})

describe('MeusDados', () => {
  it('baixa a cópia dos dados', async () => {
    render(<MeusDados aoConcluir={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: /baixar uma cópia/i }))

    await waitFor(() => expect(salvar).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'meus-dados.json' }),
    ))
  })

  it('pede a exclusão só depois de confirmar', async () => {
    render(<MeusDados aoConcluir={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: /pedir a exclusão/i }))
    expect(api.pedirExclusaoDaConta).not.toHaveBeenCalled()
    expect(screen.getByText(/você não entra mais na plataforma/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /confirmar o pedido/i }))

    await waitFor(() => expect(api.pedirExclusaoDaConta).toHaveBeenCalled())
    expect(await screen.findByText(/exclusão pedida em 24\/10\/2026/i)).toBeInTheDocument()
  })

  it('quem já pediu vê o pedido e não pede de novo', async () => {
    api.obterPedidoDeExclusao = vi.fn().mockResolvedValue({ solicitada_em: '2026-10-20T10:00:00Z' })

    render(<MeusDados aoConcluir={vi.fn()} />)

    expect(await screen.findByText(/exclusão pedida em 20\/10\/2026/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pedir a exclusão/i })).not.toBeInTheDocument()
  })

  it('explica o que fica depois da exclusão', async () => {
    render(<MeusDados aoConcluir={vi.fn()} />)

    expect(await screen.findByText(/pessoa removida/i)).toBeInTheDocument()
  })
})
