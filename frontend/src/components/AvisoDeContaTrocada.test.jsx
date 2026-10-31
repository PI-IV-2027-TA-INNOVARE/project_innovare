import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AvisoDeContaTrocada from './AvisoDeContaTrocada'
import { ROLES } from '../lib/roles'

const auth = {
  user: null,
  contaTrocada: null,
  contaTrocadaNoPainel: vi.fn(),
  dispensarAvisoDeConta: vi.fn(),
}

vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}))

function renderizarEm(caminho) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <AvisoDeContaTrocada />
      <Routes>
        <Route path="/oportunidades/:id" element={<p>detalhe da oportunidade</p>} />
        <Route path="/painel" element={<p>painel</p>} />
        <Route path="/admin" element={<p>console</p>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  auth.user = { role: ROLES.PESQUISADOR, displayName: 'Pesquisadora' }
  auth.contaTrocada = null
  auth.contaTrocadaNoPainel.mockReset()
  auth.dispensarAvisoDeConta.mockReset()
})

describe('AvisoDeContaTrocada', () => {
  it('sem troca de conta, não mostra nada e a tela continua onde estava', () => {
    renderizarEm('/oportunidades/5')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('detalhe da oportunidade')).toBeInTheDocument()
  })

  it('com troca de conta, volta ao painel da conta ativa e avisa quem está nela', async () => {
    auth.contaTrocada = { nome: 'Pesquisadora', levarAoPainel: true }

    renderizarEm('/oportunidades/5')

    expect(await screen.findByText('painel')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/outra conta entrou neste navegador/i)
    expect(screen.getByRole('alert')).toHaveTextContent('Pesquisadora')
    expect(auth.contaTrocadaNoPainel).toHaveBeenCalled()
  })

  it('se a conta que entrou é de Administrador, volta ao console', async () => {
    auth.user = { role: ROLES.ADMINISTRADOR, displayName: 'Admin' }
    auth.contaTrocada = { nome: 'Admin', levarAoPainel: true }

    renderizarEm('/oportunidades/5')

    expect(await screen.findByText('console')).toBeInTheDocument()
  })

  it('depois de levada ao painel, a aba não é puxada de volta a cada tela', () => {
    auth.contaTrocada = { nome: 'Pesquisadora', levarAoPainel: false }

    renderizarEm('/oportunidades/5')

    expect(screen.getByText('detalhe da oportunidade')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('Entendi dispensa o aviso', async () => {
    auth.contaTrocada = { nome: 'Pesquisadora', levarAoPainel: false }

    renderizarEm('/painel')
    await userEvent.click(screen.getByRole('button', { name: 'Entendi' }))

    expect(auth.dispensarAvisoDeConta).toHaveBeenCalled()
  })
})
