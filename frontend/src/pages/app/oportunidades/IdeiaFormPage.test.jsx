import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IdeiaFormPage from './IdeiaFormPage'
import OportunidadesPage from './OportunidadesPage'
import { REDE_EXEMPLO } from '../rede/redeData'

const auth = { user: null, isAuthenticated: true }

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

function renderApp(rota = '/oportunidades/nova') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/oportunidades" element={<OportunidadesPage />} />
        <Route path="/oportunidades/nova" element={<IdeiaFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  auth.user = {
    role: 'supervisor',
    displayName: 'Rafael Antunes',
    email: 'supervisor@ac2microbiologia.com.br',
  }
})

describe('IdeiaFormPage', () => {
  it('anuncia a origem e a situação em que a ideia nasce', () => {
    renderApp()

    expect(screen.getByRole('heading', { name: /cadastrar ideia interna/i })).toBeInTheDocument()
    expect(screen.getByText('Ideia interna')).toBeInTheDocument()
    expect(screen.getByText(/nasce em entrada/i)).toBeInTheDocument()
  })

  it('não pede organização demandante — ideia interna não tem uma', () => {
    renderApp()

    expect(screen.queryByLabelText(/organização demandante/i)).not.toBeInTheDocument()
    expect(screen.getByText(/não tem organização demandante/i)).toBeInTheDocument()
  })

  it('oferece como responsável só quem é Supervisor na rede interna', () => {
    renderApp()

    const select = screen.getByLabelText(/supervisor responsável/i)
    const supervisores = REDE_EXEMPLO.filter((pessoa) => pessoa.papel === 'supervisor')

    expect(select.options).toHaveLength(supervisores.length)
    expect(screen.queryByRole('option', { name: 'Maria Ferreira' })).not.toBeInTheDocument()
  })

  it('já vem com o próprio Supervisor escolhido quando ele está na rede', () => {
    renderApp()

    expect(screen.getByLabelText(/supervisor responsável/i)).toHaveValue('Rafael Antunes')
  })

  it('recusa o cadastro sem título e sem resumo', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /cadastrar ideia interna/i }))

    expect(screen.getByText(/informe um título/i)).toBeInTheDocument()
    expect(screen.getByText(/descreva a ideia/i)).toBeInTheDocument()
  })

  it('confirma o cadastro e diz onde a ideia entra', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.type(screen.getByLabelText(/^título$/i), 'Cultura starter regional')
    await user.type(screen.getByLabelText(/resumo da ideia/i), 'Isolar cultura nativa da região.')
    await user.click(screen.getByRole('button', { name: /cadastrar ideia interna/i }))

    expect(await screen.findByText(/ideia interna cadastrada/i)).toBeInTheDocument()
  })
})

describe('IdeiaFormPage — rascunho e guarda de saída', () => {
  it('não segura a saída com o formulário intocado, mesmo com responsável preenchido', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('link', { name: /cancelar/i }))

    expect(await screen.findByRole('heading', { name: 'Oportunidades', level: 1 })).toBeInTheDocument()
  })

  it('segura a saída depois de digitar', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.type(screen.getByLabelText(/^título$/i), 'Cultura starter regional')
    await user.click(screen.getByRole('link', { name: /cancelar/i }))

    expect(await screen.findByRole('heading', { name: /sair sem cadastrar/i })).toBeInTheDocument()
  })

  it('guarda o rascunho em espaço próprio, sem misturar com o do problema externo', async () => {
    const user = userEvent.setup()
    const primeira = renderApp()

    await user.type(screen.getByLabelText(/^título$/i), 'Cultura starter regional')

    expect(window.localStorage.getItem(
      'pdconnect.rascunho-ideia-interna:supervisor@ac2microbiologia.com.br'
    )).toBeTruthy()
    expect(window.localStorage.getItem(
      'pdconnect.rascunho-problema:supervisor@ac2microbiologia.com.br'
    )).toBeNull()

    primeira.unmount()
    renderApp()

    expect(screen.getByLabelText(/^título$/i)).toHaveValue('Cultura starter regional')
    expect(screen.getByText(/rascunho recuperado/i)).toBeInTheDocument()
  })
})
