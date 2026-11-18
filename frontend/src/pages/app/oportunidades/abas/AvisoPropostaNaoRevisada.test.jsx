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
    render(
      <AvisoPropostaNaoRevisada oportunidadeId="OP-2026-001" irPara={irPara} podeRevisar />,
    )

    expect(await screen.findByText(/esta etapa fica liberada/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /revisar a proposta/i }))

    expect(irPara).toHaveBeenCalledWith('proposta')
  })

  /**
   * RN-IA01 indica o conteúdo não revisado a quem o lê, sem restringir o
   * perfil. Mas só o Supervisor revisa: para o Pesquisador, "revise e salve" e
   * o botão de revisar pediam algo que ele não pode fazer.
   */
  it('para quem não revisa, só informa: sem pedir revisão nem botão (RN-IA01)', async () => {
    render(<AvisoPropostaNaoRevisada oportunidadeId="OP-2026-001" irPara={vi.fn()} />)

    expect(
      await screen.findByText(/ainda não foi revisada pelo supervisor/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/não vale como definitivo/i)).toBeInTheDocument()
    expect(screen.queryByText(/você revisa/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  /**
   * A Decisão não espera a revisão. Ali, "esta etapa fica liberada" seria
   * falso: o aviso diz que o texto não vale como definitivo e leva a revisar.
   */
  it('em etapa que não espera a revisão, não diz que ela está travada (PB90)', async () => {
    const irPara = vi.fn()
    render(
      <AvisoPropostaNaoRevisada
        oportunidadeId="OP-2026-001"
        irPara={irPara}
        podeRevisar
        bloqueiaEtapa={false}
      />,
    )

    expect(await screen.findByText(/só vale como definitivo/i)).toBeInTheDocument()
    expect(screen.queryByText(/fica liberada/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /revisar a proposta/i }))
    expect(irPara).toHaveBeenCalledWith('proposta')
  })

  it('na oportunidade encerrada, diz que a decisão saiu sem revisão e não oferece revisar', async () => {
    render(
      <AvisoPropostaNaoRevisada
        oportunidadeId="OP-2026-001"
        irPara={vi.fn()}
        podeRevisar
        encerrada
      />,
    )

    expect(await screen.findByText(/não foi revisada antes da decisão/i)).toBeInTheDocument()
    expect(screen.queryByText(/fica liberada/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
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
