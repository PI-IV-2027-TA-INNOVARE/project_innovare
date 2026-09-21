import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AcessoRestritoPage from './AcessoRestritoPage'
import NaoEncontradaPage from './NaoEncontradaPage'

const auth = { user: null, isAuthenticated: true }

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

beforeEach(() => {
  auth.user = { role: 'pesquisador', displayName: 'Maria Ferreira' }
  auth.isAuthenticated = true
})

function renderRota(Componente, rota, state) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: rota, state }]}>
      <Routes>
        <Route path="*" element={<Componente />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AcessoRestritoPage', () => {
  it('diz qual página foi barrada e sob qual perfil', () => {
    renderRota(AcessoRestritoPage, '/sem-acesso', { from: '/admin' })

    expect(screen.getByRole('heading', { name: /acesso restrito/i })).toBeInTheDocument()
    expect(screen.getByText('/admin')).toBeInTheDocument()
    expect(screen.getByText('Maria Ferreira')).toBeInTheDocument()
    expect(screen.getByText('Pesquisador')).toBeInTheDocument()
  })

  it('oferece com quem falar, não só um botão de voltar', () => {
    renderRota(AcessoRestritoPage, '/sem-acesso')

    expect(screen.getByRole('link', { name: /pd@ac2microbiologia\.com\.br/ }))
      .toHaveAttribute('href', 'mailto:pd@ac2microbiologia.com.br')
    expect(screen.getByRole('link', { name: /voltar ao painel/i })).toHaveAttribute('href', '/painel')
  })
})

describe('NaoEncontradaPage', () => {
  it('mostra o endereço que não existe', () => {
    renderRota(NaoEncontradaPage, '/rota/que/nao/existe')

    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByText('/rota/que/nao/existe')).toBeInTheDocument()
  })

  it('sugere apenas destinos que o papel alcança', () => {
    renderRota(NaoEncontradaPage, '/qualquer')

    expect(screen.getByRole('link', { name: 'Meu perfil' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Administração' })).not.toBeInTheDocument()
  })

  it('dá ao Demandante a porta de entrada dele, e não a do Administrador', () => {
    auth.user = { role: 'demandante', displayName: 'Agroindústria Vale Verde' }

    renderRota(NaoEncontradaPage, '/qualquer')

    expect(screen.getByRole('link', { name: 'Meus problemas' })).toHaveAttribute(
      'href',
      '/problemas'
    )
    expect(screen.queryByRole('link', { name: 'Administração' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Oportunidades' })).not.toBeInTheDocument()
  })

  it('manda quem não está autenticado para o login', () => {
    auth.isAuthenticated = false
    auth.user = null

    renderRota(NaoEncontradaPage, '/qualquer')

    expect(screen.getByRole('link', { name: /ir para o login/i })).toHaveAttribute('href', '/login')
  })
})
