import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PrivacidadePage from './PrivacidadePage'

const estado = vi.hoisted(() => ({ autenticado: false, lerPrivacidade: null }))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: estado.autenticado }),
}))

vi.mock('../../services/pdConnectApi', () => ({
  lerPrivacidade: (...args) => estado.lerPrivacidade(...args),
}))

function renderizar() {
  return render(
    <MemoryRouter>
      <PrivacidadePage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  estado.autenticado = false
  estado.lerPrivacidade = vi.fn().mockResolvedValue({
    encarregado: { nome: 'Joana Lima', email: 'dpo@ac2microbiologia.com.br' },
    contatos: [],
  })
})

describe('PrivacidadePage', () => {
  it('abre com o resumo: o que guarda, onde fica, quem recebe e o que a pessoa controla', () => {
    renderizar()

    const resumo = within(screen.getByRole('region', { name: 'Em resumo' }))

    expect(resumo.getByText('Onde fica')).toBeInTheDocument()
    expect(resumo.getByText(/no Brasil/)).toBeInTheDocument()
    expect(resumo.getByText(/sem nome, e-mail ou telefone/)).toBeInTheDocument()
    expect(resumo.getByText(/baixar uma cópia/i)).toBeInTheDocument()
  })

  it('o índice leva a cada seção, sem precisar rolar até ela', () => {
    renderizar()

    const indice = within(screen.getByRole('navigation', { name: 'Nesta página' }))
    const secoes = screen
      .getAllByRole('heading', { level: 2 })
      .filter((titulo) => titulo.id !== 'privacidade-resumo')

    expect(indice.getAllByRole('link')).toHaveLength(secoes.length)
    secoes.forEach((titulo) => {
      expect(indice.getByRole('link', { name: titulo.textContent })).toHaveAttribute(
        'href',
        `#${titulo.id}`
      )
    })
  })

  it('informa finalidade, base legal, compartilhamento e direitos (LGPD, art. 9)', () => {
    renderizar()

    const bases = screen.getByRole('table', { name: 'Para que usamos e com que base' })

    expect(within(bases).getByRole('columnheader', { name: 'Base legal' })).toBeInTheDocument()
    expect(within(bases).getAllByRole('row')).toHaveLength(4)
    expect(screen.getByRole('heading', { name: 'Com quem compartilhamos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Seus direitos' })).toBeInTheDocument()
  })

  it('fala dos serviços de IA em geral, e não só de um provedor', () => {
    renderizar()

    const compartilhamento = within(screen.getByRole('region', { name: 'Com quem compartilhamos' }))

    expect(compartilhamento.getByText('Serviços de IA')).toBeInTheDocument()
    expect(compartilhamento.getByText(/hoje, o Gemini, do Google/)).toBeInTheDocument()
    expect(compartilhamento.getByText(/transferência internacional/)).toBeInTheDocument()
  })

  it('diz que o banco de dados fica no Brasil', () => {
    renderizar()

    const compartilhamento = within(screen.getByRole('region', { name: 'Com quem compartilhamos' }))

    expect(compartilhamento.getByText(/no Brasil, em São Paulo/)).toBeInTheDocument()
  })

  it('mostra o contato do encarregado de dados, que é um Administrador da AC2 (LGPD, art. 41)', async () => {
    renderizar()

    expect(await screen.findByText('Joana Lima')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'dpo@ac2microbiologia.com.br' })).toHaveAttribute(
      'href',
      'mailto:dpo@ac2microbiologia.com.br'
    )
    expect(screen.getByText(/Administrador da AC2/)).toBeInTheDocument()
  })

  it('sem o nome publicado, diz quem é o encarregado e aponta a administração', async () => {
    estado.lerPrivacidade = vi.fn().mockResolvedValue({
      encarregado: null,
      contatos: [{ nome: 'Suporte', email: 'suporte@ac2.example', papel: '' }],
    })

    renderizar()

    expect(await screen.findByRole('link', { name: 'suporte@ac2.example' })).toBeInTheDocument()
    expect(screen.getByText(/Administrador da AC2/)).toBeInTheDocument()
  })

  it('quem entrou vai direto para Meus dados', () => {
    estado.autenticado = true

    renderizar()

    expect(screen.getByRole('link', { name: 'Abrir Meus dados' })).toHaveAttribute('href', '/perfil')
    expect(screen.getByRole('link', { name: 'Voltar para a plataforma' })).toHaveAttribute('href', '/painel')
  })

  it('quem não entrou volta para a entrada', () => {
    renderizar()

    expect(screen.queryByRole('link', { name: 'Abrir Meus dados' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar para a entrada' })).toHaveAttribute('href', '/login')
  })
})
