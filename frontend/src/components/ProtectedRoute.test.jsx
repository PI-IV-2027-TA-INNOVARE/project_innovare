import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProtectedRoute from './ProtectedRoute'
import { ROLES } from '../lib/roles'

/**
 * Guarda de rota.
 *
 * O caso que motivou estes testes: `/oportunidades` estava sob o guard genérico,
 * então qualquer autenticado chegava lá — e o Administrador via a tela do
 * Pesquisador, com o aviso de que "seria indicado para uma equipe potencial".
 * A baseline não prevê isso para ele (CONTEXT.md §3).
 */
const auth = { user: null, isAuthenticated: true, isBootstrapping: false }

vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}))

function renderComPapel(role, requiredRole) {
  auth.user = { role, displayName: 'Fulano' }

  return render(
    <MemoryRouter initialEntries={['/protegida']}>
      <Routes>
        <Route element={<ProtectedRoute requiredRole={requiredRole} />}>
          <Route path="/protegida" element={<p>conteúdo protegido</p>} />
        </Route>
        <Route path="/sem-acesso" element={<p>acesso restrito</p>} />
        <Route path="/login" element={<p>login</p>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  auth.isAuthenticated = true
  auth.isBootstrapping = false
})

describe('ProtectedRoute', () => {
  it('deixa passar quem tem o papel exigido', () => {
    renderComPapel(ROLES.SUPERVISOR, ROLES.SUPERVISOR)

    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument()
  })

  it('aceita uma lista de papéis para telas que dois atores leem', () => {
    const permitidos = [ROLES.SUPERVISOR, ROLES.PESQUISADOR]

    renderComPapel(ROLES.PESQUISADOR, permitidos)
    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument()
  })

  it('barra quem não está na lista, em vez de entregar a tela de outro papel', () => {
    renderComPapel(ROLES.ADMINISTRADOR, [ROLES.SUPERVISOR, ROLES.PESQUISADOR])

    expect(screen.getByText('acesso restrito')).toBeInTheDocument()
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument()
  })

  it('barra também o Demandante, que acompanha os próprios problemas', () => {
    renderComPapel(ROLES.DEMANDANTE, [ROLES.SUPERVISOR, ROLES.PESQUISADOR])

    expect(screen.getByText('acesso restrito')).toBeInTheDocument()
  })

  it('sem papel exigido, basta estar autenticado', () => {
    renderComPapel(ROLES.DEMANDANTE, null)

    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument()
  })

  it('manda para o login quem não está autenticado', () => {
    auth.isAuthenticated = false
    renderComPapel(ROLES.SUPERVISOR, ROLES.SUPERVISOR)

    expect(screen.getByText('login')).toBeInTheDocument()
  })
})
