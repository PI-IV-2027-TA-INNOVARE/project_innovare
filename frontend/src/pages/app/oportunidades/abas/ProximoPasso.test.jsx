import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EsperaIA from './EsperaIA'
import ProximoPasso from './ProximoPasso'

describe('ProximoPasso', () => {
  it('diz qual é a próxima etapa e leva até ela', async () => {
    const irPara = vi.fn()

    render(<ProximoPasso etapa="competencias" irPara={irPara} />)

    expect(screen.getByText(/próximo passo · etapa 4/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /ir para competências/i }))

    expect(irPara).toHaveBeenCalledWith('competencias')
  })

  it('sem navegação disponível, só orienta', () => {
    render(<ProximoPasso etapa="decisao" texto="Aguarde a decisão do Supervisor." />)

    expect(screen.getByText('Aguarde a decisão do Supervisor.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('EsperaIA', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * A chamada ao Gemini leva de 10 a 30 segundos. Um botão que só troca o
   * rótulo para "Analisando..." não diz se a tela travou; o contador de
   * segundos é a prova de que o pedido segue vivo.
   */
  it('avisa quanto costuma demorar e conta o tempo de espera', () => {
    vi.useFakeTimers()

    render(<EsperaIA titulo="O Copiloto está escrevendo a proposta." />)

    expect(screen.getByRole('status')).toHaveTextContent(/10 a 30 segundos/i)
    expect(screen.getByText('0s')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.getByText('3s')).toBeInTheDocument()
  })
})
