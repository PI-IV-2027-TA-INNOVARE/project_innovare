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

  it('sem início informado, conta a partir de quando aparece', () => {
    render(<EsperaIA titulo="Lendo." />)

    expect(screen.getByText('0s')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(3000))

    expect(screen.getByText('3s')).toBeInTheDocument()
  })

  /**
   * A espera da fila contava desde a abertura da aba: uma execução parada
   * havia dez dias aparecia com "113s", como se estivesse quase pronta.
   */
  it('com o início da execução, conta desde ele', () => {
    render(<EsperaIA titulo="Lendo." desde={new Date(AGORA - 20000).toISOString()} />)

    expect(screen.getByText('20s')).toBeInTheDocument()
  })

  it('passados 30 segundos, avisa que está demorando mais que o normal', () => {
    render(<EsperaIA titulo="Lendo." desde={new Date(AGORA - 25000).toISOString()} />)

    expect(screen.getByText(/10 a 30 segundos/)).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(5000))

    expect(screen.getByText(/está demorando mais que o normal/i)).toBeInTheDocument()
    expect(screen.queryByText(/10 a 30 segundos/)).not.toBeInTheDocument()
  })

  it('o aviso de demora também substitui um detalhe próprio', () => {
    render(<EsperaIA titulo="Comparando." detalhe="Leva alguns segundos." />)

    act(() => vi.advanceTimersByTime(30000))

    expect(screen.getByText(/está demorando mais que o normal/i)).toBeInTheDocument()
    expect(screen.queryByText('Leva alguns segundos.')).not.toBeInTheDocument()
  })

  it('relógio do aparelho adiantado em relação ao servidor não gera tempo negativo', () => {
    render(<EsperaIA titulo="Lendo." desde={new Date(AGORA + 5000).toISOString()} />)

    expect(screen.getByText('0s')).toBeInTheDocument()
  })
})
