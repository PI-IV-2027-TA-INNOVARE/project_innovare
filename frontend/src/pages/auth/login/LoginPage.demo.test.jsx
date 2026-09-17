import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../../context/ThemeContext'
import LoginPage from './LoginPage'

const CONTAS = vi.hoisted(() => [
  {
    email: 'supervisor@ac2microbiologia.com.br',
    password: 'supervisor123',
    role: 'supervisor',
    roleLabel: 'Supervisor',
  },
  {
    email: 'pesquisador@ac2microbiologia.com.br',
    password: 'pesquisador123',
    role: 'pesquisador',
    roleLabel: 'Pesquisador',
  },
])

vi.mock('../../../services/mockAuth', () => ({
  IS_MOCK_AUTH_ENABLED: true,
  MOCK_CREDENTIAL_HINTS: CONTAS,
}))

const auth = {
  authError: '',
  isAuthenticated: false,
  signInWithCredentials: vi.fn(),
}

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <ThemeProvider>
        <LoginPage />
      </ThemeProvider>
    </MemoryRouter>
  )
}

async function abrirDemonstracao(user) {
  await user.click(screen.getByRole('button', { name: /modo demonstração/i }))
}

beforeEach(() => {
  auth.authError = ''
  auth.signInWithCredentials = vi.fn().mockResolvedValue({ ok: true })
})

describe('LoginPage — modo demonstracao ligado', () => {
  it('anuncia que esta sem backend, mas nasce recolhido', () => {
    renderLogin()

    const gatilho = screen.getByRole('button', { name: /modo demonstração/i })

    expect(gatilho).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /conta de Supervisor/i })).not.toBeInTheDocument()
  })

  it('lista uma conta por ator depois de expandir', async () => {
    const user = userEvent.setup()
    renderLogin()

    await abrirDemonstracao(user)

    expect(screen.getByRole('button', { name: /modo demonstração/i }))
      .toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /conta de Supervisor/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /conta de Pesquisador/i })).toBeInTheDocument()
  })

  it('o chip identifica a conta pelo e-mail no nome acessivel', async () => {
    const user = userEvent.setup()
    renderLogin()

    await abrirDemonstracao(user)

    expect(
      screen.getByRole('button', { name: /supervisor@ac2microbiologia\.com\.br/ })
    ).toBeInTheDocument()
  })

  it('clicar no chip preenche e-mail e senha do formulario', async () => {
    const user = userEvent.setup()
    renderLogin()

    await abrirDemonstracao(user)
    await user.click(screen.getByRole('button', { name: /conta de Supervisor/i }))

    expect(screen.getByLabelText('E-mail')).toHaveValue('supervisor@ac2microbiologia.com.br')
    expect(screen.getByLabelText('Senha')).toHaveValue('supervisor123')
  })

  it('preencher pelo chip limpa um erro anterior', async () => {
    const user = userEvent.setup()
    renderLogin()

    await abrirDemonstracao(user)
    await user.click(screen.getByRole('button', { name: /^entrar$/i }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /conta de Supervisor/i }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
