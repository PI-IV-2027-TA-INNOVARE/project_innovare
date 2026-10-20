import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AvisoPropostaNaoRevisada from './AvisoPropostaNaoRevisada'

const api = vi.hoisted(() => ({ obterProposta: null }))

vi.mock('../../../../services/pdConnectApi', () => ({
  obterProposta: (...args) => api.obterProposta(...args),
}))

const PROPOSTA = {
  problema_pesquisa: 'Contaminação resiste à pasteurização.',
  hipotese: '',
  objetivo_geral: '',
  objetivos_especificos: [],
  metodologia: '',
  resultados_esperados: '',
  caracterizacao_inovacao: '',
  infraestrutura_recursos: '',
  revisada_por_humano: false,
}

/**
 * PB41: conteúdo da IA não revisado não é tratado como definitivo "sem
 * indicação de revisão". O selo vivia só na aba Proposta; quem seguia para
 * Competências, Equipe ou Pré-análise trabalhava sobre ele sem aviso.
 */
describe('AvisoPropostaNaoRevisada', () => {
  beforeEach(() => {
    api.obterProposta = vi.fn().mockResolvedValue(PROPOSTA)
  })

  it('avisa quando a proposta tem conteúdo e ninguém a revisou', async () => {
    render(<AvisoPropostaNaoRevisada oportunidadeId="OP-2026-001" />)

    expect(await screen.findByText(/ainda não foi revisada/i)).toBeInTheDocument()
    expect(api.obterProposta).toHaveBeenCalledWith('OP-2026-001')
  })

  it('leva à aba Proposta para revisar', async () => {
    const irPara = vi.fn()
    render(<AvisoPropostaNaoRevisada oportunidadeId="OP-2026-001" irPara={irPara} />)

    await userEvent.click(await screen.findByRole('button', { name: /revisar a proposta/i }))

    expect(irPara).toHaveBeenCalledWith('proposta')
  })

  it('não avisa depois da revisão humana', async () => {
    api.obterProposta = vi
      .fn()
      .mockResolvedValue({ ...PROPOSTA, revisada_por_humano: true })
    render(<AvisoPropostaNaoRevisada oportunidadeId="OP-2026-001" />)

    await waitFor(() => expect(api.obterProposta).toHaveBeenCalled())
    expect(screen.queryByText(/ainda não foi revisada/i)).not.toBeInTheDocument()
  })

  it('não avisa sobre proposta vazia: não há o que revisar', async () => {
    api.obterProposta = vi
      .fn()
      .mockResolvedValue({ ...PROPOSTA, problema_pesquisa: '' })
    render(<AvisoPropostaNaoRevisada oportunidadeId="OP-2026-001" />)

    await waitFor(() => expect(api.obterProposta).toHaveBeenCalled())
    expect(screen.queryByText(/ainda não foi revisada/i)).not.toBeInTheDocument()
  })

  it('sem proposta, ou com a leitura recusada, fica em silêncio', async () => {
    api.obterProposta = vi.fn().mockRejectedValue({ status: 404 })
    render(<AvisoPropostaNaoRevisada oportunidadeId="OP-2026-001" />)

    await waitFor(() => expect(api.obterProposta).toHaveBeenCalled())
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
