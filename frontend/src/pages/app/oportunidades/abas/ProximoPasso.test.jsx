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
   * rótulo para "Analisando..." não diz se a tela travou. O contador de
   * segundos fazia esse papel, mas desmentia o "10 a 30 segundos" quando
   * passava dele e era lido pelo leitor de tela a cada segundo. Agora o
   * ícone girando mostra que o pedido segue vivo, e a frase muda quando
   * demora.
   */
  it('avisa quanto costuma demorar, com um ícone girando e sem contar segundos', () => {
    vi.useFakeTimers()

    const { container } = render(<EsperaIA titulo="O Copiloto está escrevendo a proposta." />)

    expect(screen.getByRole('status')).toHaveTextContent(/10 a 30 segundos/i)
    expect(container.querySelector('.espera-ia__icone')).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.getByRole('status')).not.toHaveTextContent(/\ds\b/)
  })
})
