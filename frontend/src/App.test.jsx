import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const auth = vi.hoisted(() => ({ user: null, isAuthenticated: false, isBootstrapping: false }))

vi.mock('./context/AuthContext', () => ({
  useAuth: () => auth,
}))

vi.mock('./components/AuthenticatedLayout', async () => {
  const { Outlet } = await import('react-router-dom')

  return {
    default: () => (
      <div data-testid="layout-autenticado">
        <Outlet />
      </div>
    ),
  }
})

function renderEm(rota) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  auth.user = { role: 'supervisor', displayName: 'Rafael Antunes' }
  auth.isAuthenticated = true
  auth.isBootstrapping = false
})

describe('App — endereço que não existe', () => {
  /**
   * A rota coringa ficava fora do layout: quem tinha entrado perdia o menu e
   * o cabeçalho num endereço errado, e só restavam os botões da página. Agora
   * a página não encontrada abre dentro do layout para quem entrou, e sem ele
   * para quem não entrou, com o caminho do login.
   */
  it('quem entrou continua com o menu e o cabeçalho', async () => {
    renderEm('/endereco/que/nao/existe')

    const titulo = await screen.findByRole('heading', { level: 1, name: 'Página não encontrada' })

    expect(screen.getByTestId('layout-autenticado')).toContainElement(titulo)
  })

  it('quem não entrou vê a página sem o menu, com o caminho do login', async () => {
    auth.user = null
    auth.isAuthenticated = false

    renderEm('/endereco/que/nao/existe')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Página não encontrada' }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('layout-autenticado')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ir para o login/i })).toHaveAttribute('href', '/login')
  })

  it('enquanto a sessão é retomada, não decide entre os dois', async () => {
    auth.user = null
    auth.isAuthenticated = false
    auth.isBootstrapping = true

    renderEm('/endereco/que/nao/existe')

    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Página não encontrada' })).not.toBeInTheDocument()
  })
})
