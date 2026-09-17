import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AcessoRestritoPage from '../../system/AcessoRestritoPage'
import { CONTATOS_PADRAO, lerContatos } from '../../system/contatosSuporte'
import ParametrosSection from './ParametrosSection'

const auth = { user: null, isAuthenticated: true }

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

beforeEach(() => {
  window.localStorage.clear()
  auth.user = {
    role: 'administrador',
    displayName: 'Administração da plataforma',
    email: 'admin@ac2microbiologia.com.br',
  }
})

function renderParametros() {
  return render(<ParametrosSection />)
}

describe('ParametrosSection', () => {
  it('parte dos contatos padrão da AC2', () => {
    renderParametros()

    expect(screen.getByDisplayValue('pd@ac2microbiologia.com.br')).toBeInTheDocument()
    expect(screen.getByDisplayValue('admin@ac2microbiologia.com.br')).toBeInTheDocument()
  })

  it('recusa e-mail inválido', async () => {
    const user = userEvent.setup()
    renderParametros()

    const campo = screen.getByDisplayValue('pd@ac2microbiologia.com.br')
    await user.clear(campo)
    await user.type(campo, 'pd-arroba-ac2')
    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))

    expect(screen.getByText(/e-mail inválido/i)).toBeInTheDocument()
    expect(lerContatos()).toEqual([...CONTATOS_PADRAO])
  })

  it('grava o que foi salvo e a tela de acesso restrito passa a mostrar', async () => {
    const user = userEvent.setup()
    const painel = renderParametros()

    const campo = screen.getByDisplayValue('pd@ac2microbiologia.com.br')
    await user.clear(campo)
    await user.type(campo, 'pesquisa@ac2microbiologia.com.br')
    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))

    expect(await screen.findByText(/contatos de suporte atualizados/i)).toBeInTheDocument()

    painel.unmount()
    render(
      <MemoryRouter initialEntries={[{ pathname: '/sem-acesso', state: { from: '/admin' } }]}>
        <AcessoRestritoPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: /pesquisa@ac2microbiologia\.com\.br/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^pd@ac2microbiologia\.com\.br$/ })).not.toBeInTheDocument()
  })

  it('adiciona e remove contato', async () => {
    const user = userEvent.setup()
    renderParametros()

    await user.click(screen.getByRole('button', { name: /adicionar contato/i }))
    expect(screen.getAllByLabelText('E-mail')).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: /remover contato administração da plataforma/i }))
    expect(screen.getAllByLabelText('E-mail')).toHaveLength(2)
  })

  it('não deixa salvar uma lista vazia — é a saída de quem foi barrado', async () => {
    const user = userEvent.setup()
    renderParametros()

    for (const nome of [/remover contato núcleo/i, /remover contato administração/i]) {
      await user.click(screen.getByRole('button', { name: nome }))
    }

    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))

    expect(await screen.findByText(/deixe ao menos um contato/i)).toBeInTheDocument()
  })

  it('restaura o padrão da AC2', async () => {
    const user = userEvent.setup()
    renderParametros()

    const campo = screen.getByDisplayValue('pd@ac2microbiologia.com.br')
    await user.clear(campo)
    await user.type(campo, 'outro@ac2microbiologia.com.br')
    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))
    await user.click(screen.getByRole('button', { name: /restaurar padrão/i }))

    expect(screen.getByDisplayValue('pd@ac2microbiologia.com.br')).toBeInTheDocument()
    expect(lerContatos()).toEqual([...CONTATOS_PADRAO])
  })

  it('não desenha editor de critérios da pré-análise antes de P4', () => {
    renderParametros()

    const criterios = screen
      .getByRole('heading', { name: /critérios da pré-análise/i })
      .closest('.perfil-card')

    expect(within(criterios).getByText(/decisão do product owner/i)).toBeInTheDocument()
    expect(within(criterios).queryByRole('textbox')).not.toBeInTheDocument()
  })
})
