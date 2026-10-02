import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthNav from './AuthNav'
import { ROLES } from '../lib/roles'

const auth = { user: null, logout: vi.fn() }

vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}))

vi.mock('./NotificacoesMenu', () => ({
  default: () => <button type="button">Notificações</button>,
}))

vi.mock('./ThemeToggle', () => ({
  default: () => <button type="button">Tema</button>,
}))

const renderizar = () =>
  render(
    <MemoryRouter>
      <AuthNav />
    </MemoryRouter>
  )

const sino = () => screen.queryByRole('button', { name: /notifica/i })

beforeEach(() => {
  auth.user = { role: ROLES.DEMANDANTE, displayName: 'Joana Alves' }
})

describe('Sino de notificações na barra autenticada', () => {
  it('fica à mão do Demandante Externo, a quem o backlog pede avisar', () => {
    renderizar()

    expect(sino()).toBeInTheDocument()
  })

  it('não é desenhado para os outros três atores', () => {
    /**
     * A barra já é montada por papel - os itens de navegação seguem a mesma
     * regra. O sino entra na fila: o aviso do backlog é o do Demandante, e
     * ícone que nunca tem nada dentro é ruído na barra de todo mundo.
     */
    for (const role of [ROLES.SUPERVISADOR, ROLES.PESQUISADOR, ROLES.ADMINISTRADOR]) {
      auth.user = { role, displayName: 'Fulano' }

      const { unmount } = renderizar()

      expect(sino()).not.toBeInTheDocument()

      unmount()
    }
  })

  it('some junto com o sino, sem quebrar o resto da barra', () => {
    auth.user = { role: ROLES.SUPERVISOR, displayName: 'Rafael Antunes' }

    renderizar()

    expect(screen.getByRole('button', { name: 'Tema' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Oportunidades' })).toBeInTheDocument()
  })
})