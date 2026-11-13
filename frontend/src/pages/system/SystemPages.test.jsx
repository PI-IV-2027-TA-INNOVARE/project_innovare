import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AcessoRestritoPage from './AcessoRestritoPage'
import NaoEncontradaPage from './NaoEncontradaPage'

const auth = { user: null, isAuthenticated: true }

const api = vi.hoisted(() => ({ lerContatosSuporte: null }))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

vi.mock('../../services/pdConnectApi', () => ({
  lerContatosSuporte: (...args) => api.lerContatosSuporte(...args),
}))

beforeEach(() => {
  auth.user = { role: 'pesquisador', displayName: 'Maria Ferreira' }
  auth.isAuthenticated = true
  api.lerContatosSuporte = vi.fn().mockResolvedValue([
    { nome: 'Núcleo de P&D — AC2', email: 'pd@ac2microbiologia.com.br', papel: 'Cadastro e liberação de acesso' },
  ])
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

  it('oferece com quem falar, não só um botão de voltar', async () => {
    renderRota(AcessoRestritoPage, '/sem-acesso')

    expect(await screen.findByRole('link', { name: /pd@ac2microbiologia\.com\.br/ }))
      .toHaveAttribute('href', 'mailto:pd@ac2microbiologia.com.br')
    expect(screen.getByRole('link', { name: /voltar ao painel/i })).toHaveAttribute('href', '/painel')
  })

  it('mostra os contatos gravados pelo Administrador, que valem para todos', async () => {
    api.lerContatosSuporte = vi.fn().mockResolvedValue([
      { nome: 'Pesquisa AC2', email: 'pesquisa@ac2microbiologia.com.br', papel: 'Rede' },
    ])

    renderRota(AcessoRestritoPage, '/sem-acesso')

    expect(await screen.findByRole('link', { name: /pesquisa@ac2microbiologia\.com\.br/ }))
      .toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /pd@ac2microbiologia/ })).not.toBeInTheDocument()
  })

  it('avisa quando não consegue carregar os contatos', async () => {
    api.lerContatosSuporte = vi.fn().mockRejectedValue(new Error('offline'))

    renderRota(AcessoRestritoPage, '/sem-acesso')

    expect(await screen.findByText(/não foi possível carregar os contatos/i)).toBeInTheDocument()
  })
})

describe('NaoEncontradaPage', () => {
  /**
   * A página dizia "Endereço não encontrado", repetia o caminho digitado e
   * listava todos os destinos do papel, que o menu do layout já mostra. Agora
   * o 404 é o destaque, o texto diz o que aconteceu sem termo técnico, e há
   * duas saídas: voltar à seção em que a pessoa estava e ir para o início
   * dela. Tentar de novo não entra: recarregar não faz o endereço existir.
   */
  it('diz que a página não foi encontrada, com o 404 em destaque', () => {
    renderRota(NaoEncontradaPage, '/rota/que/nao/existe')

    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeInTheDocument()
    expect(screen.getByText(/o endereço pode estar incorreto/i)).toBeInTheDocument()
  })

  it('volta para a seção em que a pessoa estava e oferece o painel', () => {
    auth.user = { role: 'supervisor', displayName: 'Rafael Antunes' }

    renderRota(NaoEncontradaPage, '/oportunidades/OP-2026-014/qualquer')

    expect(screen.getByRole('link', { name: /voltar para oportunidades/i })).toHaveAttribute(
      'href',
      '/oportunidades'
    )
    expect(screen.getByRole('link', { name: 'Ir para o painel' })).toHaveAttribute('href', '/painel')
  })

  it('fora de uma seção conhecida, oferece só o início do papel', () => {
    renderRota(NaoEncontradaPage, '/qualquer')

    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Ir para o painel' })).toHaveAttribute('href', '/painel')
  })

  it('leva o Demandante de volta aos problemas dele, e não à Administração', () => {
    auth.user = { role: 'demandante', displayName: 'Agroindústria Vale Verde' }

    renderRota(NaoEncontradaPage, '/problemas/OP-2026-014/qualquer')

    expect(screen.getByRole('link', { name: /voltar para meus problemas/i })).toHaveAttribute(
      'href',
      '/problemas'
    )
    expect(screen.queryByRole('link', { name: /administração/i })).not.toBeInTheDocument()
  })

  it('o início do Administrador é a Administração', () => {
    auth.user = { role: 'administrador', displayName: 'Ana Souza' }

    renderRota(NaoEncontradaPage, '/qualquer')

    expect(screen.getByRole('link', { name: 'Ir para a administração' })).toHaveAttribute(
      'href',
      '/admin'
    )
  })

  it('não oferece tentar de novo', () => {
    renderRota(NaoEncontradaPage, '/qualquer')

    expect(screen.queryByRole('button', { name: /tentar/i })).not.toBeInTheDocument()
  })

  it('manda quem não está autenticado para o login', () => {
    auth.isAuthenticated = false
    auth.user = null

    renderRota(NaoEncontradaPage, '/qualquer')

    expect(screen.getByRole('link', { name: /ir para o login/i })).toHaveAttribute('href', '/login')
  })
})
