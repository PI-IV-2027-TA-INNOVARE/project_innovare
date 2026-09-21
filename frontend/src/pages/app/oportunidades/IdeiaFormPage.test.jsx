import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IdeiaFormPage from './IdeiaFormPage'
import OportunidadesPage from './OportunidadesPage'

const auth = { user: null, isAuthenticated: true }

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

const api = vi.hoisted(() => ({
  listarRede: null,
  criarOportunidade: null,
  listOportunidades: null,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  listarRede: (...args) => api.listarRede(...args),
  criarOportunidade: (...args) => api.criarOportunidade(...args),
  listOportunidades: (...args) => api.listOportunidades(...args),
}))

const RAFAEL = {
  id_membro: 2,
  nome: 'Rafael Antunes',
  email: 'supervisor@ac2microbiologia.com.br',
  papel_rede: 'supervisor',
  titulacao_codigo: 'doutorado',
  disponibilidade: 'integral',
  situacao: 'ativo',
  competencias: [],
  tecnicas: [],
  linhas: [],
  tem_acesso: true,
}

const BEATRIZ = {
  ...RAFAEL,
  id_membro: 8,
  nome: 'Beatriz Lima',
  email: 'beatriz.lima@ac2microbiologia.com.br',
}

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

  api.listarRede = vi.fn().mockResolvedValue({ results: [RAFAEL, BEATRIZ] })
  api.criarOportunidade = vi.fn().mockResolvedValue({ codigo: 'OP-2026-021' })
  api.listOportunidades = vi.fn().mockResolvedValue({ results: [] })
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

  it('oferece como responsável só quem a API devolve como Supervisor', async () => {
    renderApp()

    const select = screen.getByLabelText(/supervisor responsável/i)

    expect(await screen.findByRole('option', { name: 'Rafael Antunes' })).toBeInTheDocument()
    expect(select.options).toHaveLength(2)
    expect(api.listarRede).toHaveBeenCalledWith({ papel_rede: 'supervisor' })
    expect(screen.queryByRole('option', { name: 'Maria Ferreira' })).not.toBeInTheDocument()
  })

  it('já vem com o próprio Supervisor escolhido quando ele está na rede', async () => {
    renderApp()

    await screen.findByRole('option', { name: 'Rafael Antunes' })

    expect(screen.getByLabelText(/supervisor responsável/i)).toHaveValue('2')
  })

  it('recusa o cadastro sem título e sem resumo, sem chamar a API', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /cadastrar ideia interna/i }))

    expect(screen.getByText(/informe um título/i)).toBeInTheDocument()
    expect(screen.getByText(/descreva a ideia/i)).toBeInTheDocument()
    expect(api.criarOportunidade).not.toHaveBeenCalled()
  })

  it('manda o cadastro para a API com o responsável escolhido', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('option', { name: 'Rafael Antunes' })

    await user.type(screen.getByLabelText(/^título$/i), 'Cultura starter regional')
    await user.type(screen.getByLabelText(/resumo da ideia/i), 'Isolar cultura nativa da região.')
    await user.type(screen.getByLabelText(/motivação/i), 'Padronizar o queijo artesanal.')
    await user.click(screen.getByRole('button', { name: /cadastrar ideia interna/i }))

    expect(api.criarOportunidade).toHaveBeenCalledTimes(1)

    const corpo = api.criarOportunidade.mock.calls[0][0]
    expect(corpo.titulo).toBe('Cultura starter regional')
    expect(corpo.responsavel).toBe(2)
    expect(corpo.contexto).toContain('Motivação: Padronizar o queijo artesanal.')

    expect(await screen.findByText(/ideia interna cadastrada/i)).toBeInTheDocument()
  })

  it('mostra a recusa do servidor sem perder o formulário', async () => {
    const user = userEvent.setup()
    api.criarOportunidade = vi.fn().mockRejectedValue(new Error('titulo: campo obrigatório.'))

    renderApp()
    await screen.findByRole('option', { name: 'Rafael Antunes' })

    await user.type(screen.getByLabelText(/^título$/i), 'Cultura starter regional')
    await user.type(screen.getByLabelText(/resumo da ideia/i), 'Isolar cultura nativa.')
    await user.click(screen.getByRole('button', { name: /cadastrar ideia interna/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/campo obrigatório/i)
    expect(screen.getByLabelText(/^título$/i)).toHaveValue('Cultura starter regional')
  })

  it('avisa quando não consegue carregar os supervisores', async () => {
    api.listarRede = vi.fn().mockRejectedValue(new Error('Sessão expirada.'))

    renderApp()

    expect(await screen.findByRole('alert')).toHaveTextContent('Sessão expirada.')
  })
})

describe('IdeiaFormPage — rascunho e guarda de saída', () => {
  it('não segura a saída com o formulário intocado, mesmo com responsável preenchido', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('option', { name: 'Rafael Antunes' })
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
