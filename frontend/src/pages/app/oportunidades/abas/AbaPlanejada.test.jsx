import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AbaPlanejada from './AbaPlanejada'

function renderizar(props = {}) {
  return render(
    <AbaPlanejada
      titulo="Pré-análise"
      texto="Avalia a maturidade da proposta frente aos critérios do PIPE/FAPESP."
      {...props}
    />
  )
}

describe('AbaPlanejada', () => {
  it('usa o título e o texto da etapa que ainda não existe', () => {
    renderizar()

    expect(screen.getByRole('heading', { name: 'Pré-análise' })).toBeInTheDocument()
    expect(screen.getByText(/avalia a maturidade da proposta/i)).toBeInTheDocument()
  })

  it('marca a etapa como planejada, para ninguém ler como pronta', () => {
    renderizar()

    expect(screen.getByText('Planejado')).toBeInTheDocument()
  })

  it('diz que a etapa não foi implementada', () => {
    renderizar()

    expect(screen.getByText(/etapa ainda não implementada/i)).toBeInTheDocument()
  })

  it('não inventa resultado de exemplo, e explica por quê', () => {
    renderizar()

    expect(screen.getByText(/nada é exibido aqui em forma de exemplo/i))
      .toBeInTheDocument()
    expect(screen.getByText(/uma saída simulada ensinaria a ler um resultado/i))
      .toBeInTheDocument()
  })

  it('serve a qualquer etapa, sem texto preso no componente', () => {
    renderizar({ titulo: 'Matching', texto: 'Compara competências com a rede.' })

    expect(screen.getByRole('heading', { name: 'Matching' })).toBeInTheDocument()
    expect(screen.getByText('Compara competências com a rede.')).toBeInTheDocument()
    expect(screen.queryByText('Pré-análise')).not.toBeInTheDocument()
  })
})
