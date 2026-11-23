import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AbaHistorico from './AbaHistorico'

const api = vi.hoisted(() => ({ solicitarComplemento: null }))

vi.mock('../../../../services/pdConnectApi', () => ({
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
      {...props}
    />
  )
}

describe('AbaHistorico — observação do Supervisor (PB65)', () => {
  /**
   * A observação se registra na etapa Decisão, onde o Supervisor avalia. Dois
   * campos para a mesma nota deixavam a dúvida de qual usar, e a nota escrita
   * aqui sumia ao trocar de aba. A trilha segue mostrando todas.
   */
  it('a trilha mostra as observações, mas não oferece outro campo para elas', () => {
    renderizar({ podeSolicitarComplemento: true })

    expect(screen.queryByLabelText(/observação/i)).not.toBeInTheDocument()
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

  it('entrega o pedido para a trilha da página e limpa o campo', async () => {
    const user = userEvent.setup()
    const aoRegistrar = vi.fn()
    api.solicitarComplemento = vi.fn().mockResolvedValue({
      ocorrido_em: '2026-09-22T09:00:00.000Z',
      mensagem: 'Faltam os laudos do lote.',
      autor_nome: 'Rafael Antunes',
    })

    renderizar({ podeSolicitarComplemento: true, aoRegistrar })

    const campo = screen.getByLabelText(/solicitar complementação/i)
    await user.type(campo, 'Faltam os laudos do lote.')
    await user.click(screen.getByRole('button', { name: /^solicitar$/i }))

    expect(aoRegistrar).toHaveBeenCalledWith(
      expect.objectContaining({
        categoria: 'oportunidade',
        ator: 'Rafael Antunes',
        em: Date.parse('2026-09-22T09:00:00.000Z'),
        texto: expect.stringMatching(/faltam os laudos do lote/i),
      }),
    )
    expect(campo).toHaveValue('')
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

  it('quem não é Supervisor não vê o pedido', () => {
    renderizar({ podeSolicitarComplemento: false })

    expect(screen.queryByLabelText(/solicitar complementação/i)).not.toBeInTheDocument()
  })
})

describe('AbaHistorico — versão anterior da proposta (PB88)', () => {
  it('deixa consultar o texto que o elemento tinha antes', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderizar({
      historico: [
        {
          id: 'e2',
          em: Date.parse('2026-11-12T10:00:00.000Z'),
          categoria: 'copiloto',
          ator: 'Rafael Antunes',
          texto: 'Sugestão do Copiloto aceita na proposta.',
          anterior: [{ elemento: 'metodologia', rotulo: 'Metodologia', texto: 'PCR em tempo real.' }],
        },
      ],
    })

    expect(screen.getByText('PCR em tempo real.')).not.toBeVisible()

    await usuario.click(screen.getByRole('button', { name: /ver a versão anterior/i }))

    expect(screen.getByText('PCR em tempo real.')).toBeVisible()
    expect(screen.getByText('Metodologia')).toBeVisible()
  })

  it('evento sem versão anterior não oferece consulta', () => {
    renderizar()

    expect(screen.queryByRole('button', { name: /ver a versão anterior/i })).not.toBeInTheDocument()
  })
})
