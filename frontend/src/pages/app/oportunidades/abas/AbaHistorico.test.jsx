import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AbaHistorico from './AbaHistorico'

const api = vi.hoisted(() => ({ registrarObservacao: null, solicitarComplemento: null }))

vi.mock('../../../../services/pdConnectApi', () => ({
  registrarObservacao: (...args) => api.registrarObservacao(...args),
  solicitarComplemento: (...args) => api.solicitarComplemento(...args),
}))

const CADASTRO = {
  id: 'e1',
  em: Date.parse('2026-09-01T10:00:00.000Z'),
  categoria: 'oportunidade',
  ator: 'Agroindústria Vale Verde',
  texto: 'Problema externo cadastrado.',
}

function renderizar(props = {}) {
  return render(
    <AbaHistorico
      codigo="OP-2026-014"
      historico={[CADASTRO]}
      podeRegistrar
      {...props}
    />
  )
}

beforeEach(() => {
  api.registrarObservacao = vi.fn().mockResolvedValue({
    ocorrido_em: '2026-09-22T10:00:00.000Z',
    texto: 'Laudo do lote de verão confirma a contaminação.',
    autor_nome: 'Rafael Antunes',
  })
})

describe('AbaHistorico — observação do Supervisor (PB65)', () => {
  it('registra a observação e ela aparece na trilha', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderizar()

    await usuario.type(
      screen.getByLabelText(/registrar observação/i),
      'Laudo do lote de verão confirma a contaminação.'
    )
    await usuario.click(screen.getByRole('button', { name: /^Registrar$/i }))

    await waitFor(() =>
      expect(api.registrarObservacao).toHaveBeenCalledWith(
        'OP-2026-014', 'Laudo do lote de verão confirma a contaminação.'
      )
    )

    expect(
      await screen.findByText('Laudo do lote de verão confirma a contaminação.')
    ).toBeInTheDocument()
  })

  it('não registra observação vazia', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderizar()

    await usuario.click(screen.getByRole('button', { name: /^Registrar$/i }))

    expect(api.registrarObservacao).not.toHaveBeenCalled()
  })

  it('mostra a recusa do servidor sem perder o texto digitado', async () => {
    api.registrarObservacao = vi
      .fn()
      .mockRejectedValue(new Error('Texto curto demais.'))

    const usuario = userEvent.setup({ delay: null })
    renderizar()

    const campo = screen.getByLabelText(/registrar observação/i)
    await usuario.type(campo, 'Laudo confirma.')
    await usuario.click(screen.getByRole('button', { name: /^Registrar$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/curto demais/i)
    expect(campo).toHaveValue('Laudo confirma.')
  })

  it('quem não conduz a oportunidade lê a trilha sem o campo', () => {
    renderizar({ podeRegistrar: false })

    expect(
      screen.queryByLabelText(/registrar observação/i)
    ).not.toBeInTheDocument()
  })

  it('a observação tem filtro próprio, separado do resto', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderizar({
      historico: [
        CADASTRO,
        {
          id: 'e2',
          em: Date.parse('2026-09-02T10:00:00.000Z'),
          categoria: 'observacao',
          ator: 'Rafael Antunes',
          texto: 'Conversa com o demandante esclareceu o lote.',
        },
      ],
    })

    await usuario.click(screen.getByRole('button', { name: 'Observações' }))

    expect(
      screen.getByText('Conversa com o demandante esclareceu o lote.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Problema externo cadastrado.')).not.toBeInTheDocument()
  })
})

describe('AbaHistorico — pedido de complementação (PB26)', () => {
  it('o Supervisor pede complementação sem passar pela Decisão', async () => {
    const user = userEvent.setup()
    api.solicitarComplemento = vi.fn().mockResolvedValue({
      ocorrido_em: '2026-09-22T09:00:00.000Z',
      mensagem: 'Faltam os laudos do lote.',
      autor_nome: 'Rafael Antunes',
    })

    renderizar({ podeSolicitarComplemento: true })

    await user.type(
      screen.getByLabelText(/solicitar complementação/i),
      'Faltam os laudos do lote.'
    )
    await user.click(screen.getByRole('button', { name: /^solicitar$/i }))

    expect(api.solicitarComplemento).toHaveBeenCalledWith(
      'OP-2026-014',
      'Faltam os laudos do lote.'
    )
  })

  it('o pedido entra na trilha na hora, sem recarregar a página', async () => {
    const user = userEvent.setup()
    api.solicitarComplemento = vi.fn().mockResolvedValue({
      ocorrido_em: '2026-09-22T09:00:00.000Z',
      mensagem: 'Faltam os laudos do lote.',
      autor_nome: 'Rafael Antunes',
    })

    renderizar({ podeSolicitarComplemento: true })

    await user.type(
      screen.getByLabelText(/solicitar complementação/i),
      'Faltam os laudos do lote.'
    )
    await user.click(screen.getByRole('button', { name: /^solicitar$/i }))

    expect(await screen.findByText(/faltam os laudos do lote/i)).toBeInTheDocument()
  })

  it('diz que o pedido não é decisão e não move a etapa', () => {
    renderizar({ podeSolicitarComplemento: true })

    expect(screen.getByText(/não é decisão e não muda a etapa/i)).toBeInTheDocument()
  })

  it('mostra o erro da API e mantém o texto para tentar de novo', async () => {
    const user = userEvent.setup()
    api.solicitarComplemento = vi.fn().mockRejectedValue(
      new Error('Esta oportunidade nao tem Demandante Externo.')
    )

    renderizar({ podeSolicitarComplemento: true })

    const campo = screen.getByLabelText(/solicitar complementação/i)
    await user.type(campo, 'Faltam os laudos.')
    await user.click(screen.getByRole('button', { name: /^solicitar$/i }))

    expect(await screen.findByText(/nao tem Demandante Externo/i)).toBeInTheDocument()
    expect(campo).toHaveValue('Faltam os laudos.')
  })

  it('ideia interna não oferece o pedido: não há a quem pedir', () => {
    renderizar({ podeSolicitarComplemento: false })

    expect(screen.queryByLabelText(/solicitar complementação/i)).not.toBeInTheDocument()
  })

  it('quem não é Supervisor não vê o pedido nem a observação', () => {
    renderizar({ podeRegistrar: false, podeSolicitarComplemento: false })

    expect(screen.queryByLabelText(/solicitar complementação/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/registrar observação/i)).not.toBeInTheDocument()
  })
})
