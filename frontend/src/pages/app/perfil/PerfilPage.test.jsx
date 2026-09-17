import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PerfilPage from './PerfilPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      displayName: 'Maria Ferreira',
      email: 'maria.ferreira@ac2microbiologia.com.br',
      role: 'pesquisador',
    },
  }),
}))

function cartao(titulo) {
  return screen.getByRole('heading', { name: titulo, level: 2 }).closest('.perfil-card')
}

describe('PerfilPage', () => {
  it('mostra os campos do Supervisor em leitura, e não escondidos', () => {
    render(<PerfilPage />)

    const identificacao = cartao('Identificação')

    expect(within(identificacao).getByLabelText('Nome')).toHaveValue('Maria Ferreira')
    expect(within(identificacao).getByLabelText('Nome')).toHaveAttribute('readonly')
    expect(within(identificacao).getByText(/somente leitura/i)).toBeInTheDocument()

    expect(within(cartao('Vínculo')).getByLabelText('Instituição')).toBeDisabled()
  })

  it('deixa o pesquisador editar as dimensões que são dele', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)

    const titulacao = within(cartao('Formação e titulação')).getByLabelText('Titulação')
    expect(titulacao).toBeEnabled()

    await user.selectOptions(titulacao, 'doutorado')

    expect(screen.getByText('Perfil salvo automaticamente.')).toBeInTheDocument()
    expect(screen.getByText(/titulação atual/i)).toHaveTextContent('Doutorado')
  })

  it('recalcula a completude quando uma dimensão é preenchida', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '83')
    expect(screen.getByText(/falta preencher: experiência/i)).toBeInTheDocument()

    await user.type(
      within(cartao('Experiência')).getByLabelText('Resumo da experiência'),
      '11 anos em bioinsumos.'
    )

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText(/todas as dimensões preenchidas/i)).toBeInTheDocument()
  })

  it('adiciona e remove competências sem duplicar termo equivalente', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)

    const competencias = cartao('Competências')
    const campo = within(competencias).getByLabelText('Adicionar em Competências')

    await user.type(campo, 'Biologia molecular{Enter}')
    expect(within(competencias).getByRole('button', { name: /remover biologia molecular/i })).toBeInTheDocument()

    await user.type(campo, 'fermentacao{Enter}')
    expect(within(competencias).queryByRole('button', { name: /remover fermentacao/i })).not.toBeInTheDocument()

    await user.click(within(competencias).getByRole('button', { name: /remover biologia molecular/i }))
    expect(within(competencias).queryByRole('button', { name: /remover biologia molecular/i })).not.toBeInTheDocument()
  })

  it('avisa quando uma dimensão fica de fora do matching', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)

    const tecnicas = cartao('Técnicas')
    await user.click(within(tecnicas).getByRole('button', { name: /remover pcr em tempo real/i }))

    expect(within(tecnicas).getByText(/fica de fora do matching/i)).toBeInTheDocument()
  })
})
