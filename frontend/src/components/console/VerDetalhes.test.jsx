import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import VerDetalhes from './VerDetalhes'

describe('VerDetalhes', () => {
  it('começa fechado e anuncia o que controla', () => {
    render(<VerDetalhes><p>Todas as parcelas da nota</p></VerDetalhes>)

    const botao = screen.getByRole('button', { name: 'Ver detalhes' })
    const conteudo = document.getElementById(botao.getAttribute('aria-controls'))

    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(conteudo).not.toBeVisible()
  })

  it('abre no lugar com o clique', async () => {
    const user = userEvent.setup()
    render(<VerDetalhes><p>Todas as parcelas da nota</p></VerDetalhes>)

    await user.click(screen.getByRole('button', { name: 'Ver detalhes' }))

    expect(screen.getByRole('button', { name: 'Ocultar detalhes' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Todas as parcelas da nota')).toBeVisible()
  })

  it('abre e fecha pelo teclado', async () => {
    const user = userEvent.setup()
    render(<VerDetalhes><p>Todas as parcelas da nota</p></VerDetalhes>)

    await user.tab()
    await user.keyboard('{Enter}')
    expect(screen.getByText('Todas as parcelas da nota')).toBeVisible()

    await user.keyboard(' ')
    expect(screen.getByText('Todas as parcelas da nota')).not.toBeVisible()
  })

  it('mantém o conteúdo na página mesmo fechado', () => {
    render(<VerDetalhes><p>Todas as parcelas da nota</p></VerDetalhes>)

    expect(screen.getByText('Todas as parcelas da nota')).toBeInTheDocument()
  })
})
