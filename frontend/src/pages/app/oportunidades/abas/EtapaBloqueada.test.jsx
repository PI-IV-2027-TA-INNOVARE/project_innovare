import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import EtapaBloqueada from './EtapaBloqueada'

describe('EtapaBloqueada', () => {
  /**
   * Equipe e Decisão avisavam o que faltava numa faixa amarela de alerta;
   * Competências e Pré-análise, no quadro de próximo passo. Etapa que ainda
   * não começou não é erro: agora todas usam o mesmo quadro, com o caminho.
   */
  it('diz o que falta antes da etapa no quadro de próximo passo', async () => {
    const irPara = vi.fn()

    const { container } = render(
      <EtapaBloqueada
        motivo="Identifique as competências antes de gerar a equipe."
        etapa="competencias"
        irPara={irPara}
      />,
    )

    expect(screen.getByText('Identifique as competências antes de gerar a equipe.')).toBeInTheDocument()
    expect(container.querySelector('.admin-callout--alerta')).toBeNull()
    expect(container.querySelector('.proximo-passo')).not.toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /ir para competências/i }))
    expect(irPara).toHaveBeenCalledWith('competencias')
  })
})
