import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES } from '../../../lib/roles'
import PainelPage from './PainelPage'

const estado = vi.hoisted(() => ({ user: null }))

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: estado.user }),
}))

vi.mock('./PainelPorPapel', () => ({
  default: ({ user }) => <p>conteúdo do papel {user?.role}</p>,
}))

beforeEach(() => {
  estado.user = {
    idUser: 7,
    email: 'supervisor@ac2microbiologia.com.br',
    displayName: 'Rafael Antunes',
    role: ROLES.SUPERVISOR,
    roleLabel: 'Supervisor',
  }
})

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/painel']}>
      <Routes>
        <Route path="/painel" element={<PainelPage />} />
        <Route path="/admin" element={<p>console do administrador</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PainelPage', () => {
  it('saúda a pessoa pelo nome e nomeia o papel dela', () => {
    renderizar()

    expect(screen.getByRole('heading', { name: /olá, rafael antunes/i }))
      .toBeInTheDocument()
    expect(screen.getByText('Supervisor')).toBeInTheDocument()
  })

  it('entrega o painel do papel ao componente que sabe desenhá-lo', () => {
    renderizar()

    expect(screen.getByText('conteúdo do papel supervisor')).toBeInTheDocument()
  })

  it('manda o Administrador para o console, que é o painel dele', () => {
    estado.user = { ...estado.user, role: ROLES.ADMINISTRADOR, roleLabel: 'Administrador' }

    renderizar()

    expect(screen.getByText('console do administrador')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /olá/i })).not.toBeInTheDocument()
  })

  it('o Pesquisador fica no painel, e não é redirecionado', () => {
    estado.user = { ...estado.user, role: ROLES.PESQUISADOR, roleLabel: 'Pesquisador' }

    renderizar()

    expect(screen.getByText('conteúdo do papel pesquisador')).toBeInTheDocument()
    expect(screen.queryByText('console do administrador')).not.toBeInTheDocument()
  })

  it('o Demandante Externo fica no painel, e não é redirecionado', () => {
    estado.user = { ...estado.user, role: ROLES.DEMANDANTE, roleLabel: 'Demandante Externo' }

    renderizar()

    expect(screen.getByText('conteúdo do papel demandante')).toBeInTheDocument()
    expect(screen.queryByText('console do administrador')).not.toBeInTheDocument()
  })

  it('não quebra antes do perfil carregar', () => {
    estado.user = null

    renderizar()

    expect(screen.getByRole('heading', { name: /olá, usuário/i })).toBeInTheDocument()
  })

  it('não exibe aviso de ambiente de demonstração', () => {
    renderizar()

    expect(screen.queryByText(/demonstração/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/dados fictícios/i)).not.toBeInTheDocument()
  })
})
