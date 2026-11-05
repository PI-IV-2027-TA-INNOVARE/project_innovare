import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import CampoDeSenha, { RegrasDaSenha } from './CampoDeSenha'

function Campo(props) {
  const [valor, setValor] = useState('')

  return (
    <>
      <RegrasDaSenha id="regras" />
      <CampoDeSenha
        id="nova"
        rotulo="Nova senha"
        valor={valor}
        onChange={setValor}
        autoComplete="new-password"
        descricao="regras"
        {...props}
      />
    </>
  )
}

describe('CampoDeSenha', () => {
  it('esconde o que é digitado e mostra quando a pessoa pede', async () => {
    const user = userEvent.setup()
    render(<Campo />)

    const campo = screen.getByLabelText('Nova senha')
    await user.type(campo, 'Bioinsumo!2026')

    expect(campo).toHaveAttribute('type', 'password')

    const alternar = screen.getByRole('button', { name: 'Mostrar senha' })
    expect(alternar).toHaveAttribute('aria-pressed', 'false')

    await user.click(alternar)

    expect(campo).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('lê as regras junto com o campo', () => {
    render(<Campo />)

    expect(screen.getByLabelText('Nova senha')).toHaveAccessibleDescription(/pelo menos 8 caracteres/i)
  })

  it('marca o campo recusado e diz o motivo ao lado dele', () => {
    render(<Campo erro="Esta senha é muito comum." />)

    const campo = screen.getByLabelText('Nova senha')

    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveAccessibleDescription(/muito comum/i)
    expect(screen.getByRole('alert')).toHaveTextContent('Esta senha é muito comum.')
  })

  it('sem erro, não fica marcado', () => {
    render(<Campo />)

    expect(screen.getByLabelText('Nova senha')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
