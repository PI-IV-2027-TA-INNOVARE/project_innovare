import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PedidoDeComplemento from './PedidoDeComplemento'

const api = vi.hoisted(() => ({ solicitarComplemento: null }))

vi.mock('../../../../services/pdConnectApi', () => ({
  solicitarComplemento: (...args) => api.solicitarComplemento(...args),
}))

const CAMPO = /que informação falta na entrada/i

async function abrirEEscrever(user, texto) {
  await user.click(screen.getByRole('button', { name: /pedir complementação/i }))
  const campo = screen.getByLabelText(CAMPO)
  await user.type(campo, texto)
  return campo
}

describe('PedidoDeComplemento (PB26)', () => {
  beforeEach(() => {
    api.solicitarComplemento = vi.fn().mockResolvedValue({
      ocorrido_em: '2026-09-22T09:00:00.000Z',
      mensagem: 'Faltam os laudos do lote.',
      autor_nome: 'Rafael Antunes',
    })
  })

  /**
   * O pedido morava no topo do Histórico, logo abaixo de "nada aqui é
   * editado". É sobre a entrada, e é na entrada que o Supervisor percebe o
   * que falta; o campo só abre quando ele decide pedir.
   */
  it('abre o campo só quando o Supervisor decide pedir', async () => {
    const user = userEvent.setup()

    render(<PedidoDeComplemento codigo="OP-2026-014" />)

    expect(screen.getByRole('heading', { name: /falta alguma informação na entrada/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(CAMPO)).toBeNull()

    await user.click(screen.getByRole('button', { name: /pedir complementação/i }))

    expect(screen.getByLabelText(CAMPO)).toHaveFocus()
  })

  it('envia o pedido ao Demandante e entrega para a trilha da página', async () => {
    const user = userEvent.setup()
    const aoRegistrar = vi.fn()

    render(<PedidoDeComplemento codigo="OP-2026-014" aoRegistrar={aoRegistrar} />)

    await abrirEEscrever(user, 'Faltam os laudos do lote.')
    await user.click(screen.getByRole('button', { name: /enviar o pedido/i }))

    expect(api.solicitarComplemento).toHaveBeenCalledWith('OP-2026-014', 'Faltam os laudos do lote.')
    expect(aoRegistrar).toHaveBeenCalledWith(
      expect.objectContaining({
        categoria: 'oportunidade',
        ator: 'Rafael Antunes',
        em: Date.parse('2026-09-22T09:00:00.000Z'),
        texto: expect.stringMatching(/faltam os laudos do lote/i),
      }),
    )
    expect(await screen.findByText(/pedido enviado/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(CAMPO)).toBeNull()
  })

  it('diz que o pedido não é decisão e não move a etapa', async () => {
    const user = userEvent.setup()

    render(<PedidoDeComplemento codigo="OP-2026-014" />)
    await user.click(screen.getByRole('button', { name: /pedir complementação/i }))

    expect(screen.getByLabelText(CAMPO)).toHaveAccessibleDescription(/não é decisão e não muda a etapa/i)
  })

  it('mostra o erro da API e mantém o texto para tentar de novo', async () => {
    const user = userEvent.setup()
    api.solicitarComplemento = vi.fn().mockRejectedValue(
      new Error('Esta oportunidade nao tem Demandante Externo.'),
    )

    render(<PedidoDeComplemento codigo="OP-2026-014" />)

    const campo = await abrirEEscrever(user, 'Faltam os laudos.')
    await user.click(screen.getByRole('button', { name: /enviar o pedido/i }))

    expect(await screen.findByText(/nao tem Demandante Externo/i)).toBeInTheDocument()
    expect(campo).toHaveValue('Faltam os laudos.')
  })

  it('cancelar fecha o campo sem enviar', async () => {
    const user = userEvent.setup()

    render(<PedidoDeComplemento codigo="OP-2026-014" />)

    await abrirEEscrever(user, 'Rascunho.')
    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(screen.queryByLabelText(CAMPO)).toBeNull()
    expect(api.solicitarComplemento).not.toHaveBeenCalled()
  })
})
