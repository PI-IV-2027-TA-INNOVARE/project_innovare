import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EsperaIA from './EsperaIA'

const AGORA = new Date('2026-11-10T15:00:00Z').getTime()

describe('EsperaIA', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: AGORA })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * A espera mostrava os segundos correndo ao lado do aviso "10 a 30
   * segundos": passado o prazo, o número desmentia o texto e a espera parecia
   * maior. E o contador ficava numa área que o leitor de tela anuncia, que
   * lia o número a cada segundo. Agora um ícone girando diz que a IA trabalha.
   */
  it('mostra um ícone girando no lugar da contagem de segundos', () => {
    const { container } = render(<EsperaIA titulo="Lendo." />)

    act(() => vi.advanceTimersByTime(3000))

    const icone = container.querySelector('.espera-ia__icone')

    expect(icone).not.toBeNull()
    expect(icone).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByText(/^\d+\s?s$/)).toBeNull()
    expect(screen.getByRole('status')).not.toHaveTextContent(/\d+s/)
  })

  it('passados 30 segundos, avisa que está demorando mais que o normal', () => {
    render(<EsperaIA titulo="Lendo." desde={new Date(AGORA - 25000).toISOString()} />)

    expect(screen.getByText(/10 a 30 segundos/)).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(5000))

    expect(screen.getByText(/está demorando mais que o normal/i)).toBeInTheDocument()
    expect(screen.queryByText(/10 a 30 segundos/)).not.toBeInTheDocument()
  })

  /**
   * A espera da fila contava desde a abertura da aba: uma execução parada
   * havia dez dias aparecia como recém-começada.
   */
  it('com o início da execução, mede a demora desde ele', () => {
    render(<EsperaIA titulo="Lendo." desde={new Date(AGORA - 40000).toISOString()} />)

    expect(screen.getByText(/está demorando mais que o normal/i)).toBeInTheDocument()
  })

  it('o aviso de demora também substitui um detalhe próprio', () => {
    render(<EsperaIA titulo="Comparando." detalhe="Leva alguns segundos." />)

    act(() => vi.advanceTimersByTime(30000))

    expect(screen.getByText(/está demorando mais que o normal/i)).toBeInTheDocument()
    expect(screen.queryByText('Leva alguns segundos.')).not.toBeInTheDocument()
  })

  it('relógio do aparelho adiantado em relação ao servidor não conta como demora', () => {
    render(<EsperaIA titulo="Lendo." desde={new Date(AGORA + 5000).toISOString()} />)

    expect(screen.getByText(/10 a 30 segundos/)).toBeInTheDocument()
  })
})
