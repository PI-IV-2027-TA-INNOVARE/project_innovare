import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SecaoProtegida from '../../components/console/SecaoProtegida'
import { PERMISSOES } from '../../lib/permissoes'
import AdminPage from './AdminPage'
import ParametrosSection from './sections/ParametrosSection'
import { SECAO_INICIAL, SECOES_ADMIN } from './secoes'

const auth = { user: null, isAuthenticated: true }

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

function Fake({ nome }) {
  return <h2>{nome}</h2>
}

function renderConsole(rota = '/admin') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/admin" element={<AdminPage />}>
          <Route index element={<Navigate to={SECAO_INICIAL.rota} replace />} />
          <Route
            path="aparencia"
            element={
              <SecaoProtegida permissao={PERMISSOES.CONFIGURACAO}>
                <Fake nome="Aparência da plataforma" />
              </SecaoProtegida>
            }
          />
          <Route
            path="usuarios"
            element={
              <SecaoProtegida permissao={PERMISSOES.CONTAS}>
                <Fake nome="Contas da plataforma" />
              </SecaoProtegida>
            }
          />
          <Route
            path="parametros"
            element={
              <SecaoProtegida permissao={PERMISSOES.CONFIGURACAO}>
                <ParametrosSection />
              </SecaoProtegida>
            }
          />
        </Route>
        <Route path="/sem-acesso" element={<h1>Acesso restrito</h1>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  auth.user = {
    role: 'administrador',
    displayName: 'Administração da plataforma',
    email: 'admin@ac2microbiologia.com.br',
  }
})

describe('Shell do console', () => {
  it('cada seção tem endereço próprio', () => {
    renderConsole('/admin/parametros')

    expect(screen.getByRole('heading', { name: 'Parâmetros', level: 2 })).toBeInTheDocument()
  })

  it('abre na primeira seção quando a URL é só /admin', () => {
    renderConsole('/admin')

    expect(screen.getByRole('heading', { name: /aparência da plataforma/i })).toBeInTheDocument()
  })

  it('marca na barra a seção aberta', async () => {
    const user = userEvent.setup()
    renderConsole('/admin/aparencia')

    const parametros = screen.getByRole('link', { name: /parâmetros/i })
    expect(parametros).not.toHaveClass('is-active')

    await user.click(parametros)

    expect(screen.getByRole('link', { name: /parâmetros/i })).toHaveClass('is-active')
    expect(screen.getByRole('heading', { name: 'Parâmetros', level: 2 })).toBeInTheDocument()
  })

  it('desenha na barra só o que o usuário pode ver', () => {
    auth.user = {
      role: 'administrador',
      displayName: 'Operação parcial',
      email: 'parcial@ac2microbiologia.com.br',
      permissions: [PERMISSOES.CONFIGURACAO],
    }

    renderConsole('/admin/aparencia')

    expect(screen.getByRole('link', { name: /aparência/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /parâmetros/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /usuários/i })).not.toBeInTheDocument()
  })

  it('barra a seção pela URL, não só escondendo o item do menu', () => {
    auth.user = {
      role: 'administrador',
      displayName: 'Operação parcial',
      email: 'parcial@ac2microbiologia.com.br',
      permissions: [PERMISSOES.CONFIGURACAO],
    }

    renderConsole('/admin/usuarios')

    expect(screen.getByRole('heading', { name: /acesso restrito/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /contas da plataforma/i })).not.toBeInTheDocument()
  })

  it('toda seção declara uma permissão conhecida', () => {
    const conhecidas = Object.values(PERMISSOES)

    for (const secao of SECOES_ADMIN) {
      expect(conhecidas).toContain(secao.permissao)
    }
  })
})
