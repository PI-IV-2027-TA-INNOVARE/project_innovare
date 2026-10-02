import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuditoriaSection from './AuditoriaSection'

const api = vi.hoisted(() => ({ listarTrilha: null, obterFiltrosTrilha: null }))

vi.mock('../../../services/pdConnectApi', () => ({
  listarTrilha: (...args) => api.listarTrilha(...args),
  obterFiltrosTrilha: (...args) => api.obterFiltrosTrilha(...args),
}))

const FILTROS = {
  categorias: [
    { valor: 'oportunidade', rotulo: 'Oportunidade' },
    { valor: 'conta', rotulo: 'Conta e acesso' },
  ],
  status: [
    { valor: 'ok', rotulo: 'Concluido' },
    { valor: 'negado', rotulo: 'Negado' },
  ],
}

const EVENTOS = [
  {
    id_evento: 3,
    ocorrido_em: '2026-09-25T14:00:00.000Z',
    categoria: 'conta',
    categoria_rotulo: 'Conta e acesso',
    tipo: 'login_recusado',
    ator: 'maria@ac2microbiologia.com.br',
    entidade: 'usuario',
    entidade_id: '7',
    status: 'negado',
    status_rotulo: 'Negado',
    motivo: 'Senha invalida.',
    detalhe: {},
    correlation_id: '11111111-1111-1111-1111-111111111111',
  },
  {
    id_evento: 1,
    ocorrido_em: '2026-09-20T09:00:00.000Z',
    categoria: 'oportunidade',
    categoria_rotulo: 'Oportunidade',
    tipo: 'oportunidade_cadastrada',
    ator: '__sistema__',
    entidade: 'oportunidade',
    entidade_id: 'OP-2026-001',
    status: 'ok',
    status_rotulo: 'Concluido',
    motivo: '',
    detalhe: { origem: 'interna' },
    correlation_id: '22222222-2222-2222-2222-222222222222',
  },
]

const pagina = (results = EVENTOS) => ({ count: results.length, results })

const linhas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

beforeEach(() => {
  api.obterFiltrosTrilha = vi.fn().mockResolvedValue(FILTROS)
  api.listarTrilha = vi.fn().mockResolvedValue(pagina())
})

describe('Console — Auditoria', () => {
  it('lista a trilha vinda do servidor', async () => {
    render(<AuditoriaSection />)

    expect(await screen.findByText('login_recusado')).toBeInTheDocument()
    expect(screen.getByText('oportunidade_cadastrada')).toBeInTheDocument()
    expect(linhas()).toHaveLength(2)
  })

  it('monta os filtros a partir do catálogo, não de uma lista copiada', async () => {
    render(<AuditoriaSection />)

    const categoria = await screen.findByLabelText(/categoria/i)

    expect(
      within(categoria).getByRole('option', { name: 'Conta e acesso' })
    ).toBeInTheDocument()
    expect(api.obterFiltrosTrilha).toHaveBeenCalledTimes(1)
  })

  it('filtra no servidor, e não no cliente', async () => {
    const user = userEvent.setup({ delay: null })
    render(<AuditoriaSection />)
    await screen.findByText('login_recusado')

    await user.selectOptions(screen.getByLabelText(/categoria/i), 'conta')

    await waitFor(() =>
      expect(api.listarTrilha).toHaveBeenLastCalledWith(
        expect.objectContaining({ categoria: 'conta' })
      )
    )
  })

  it('a busca também vai ao servidor', async () => {
    const user = userEvent.setup({ delay: null })
    render(<AuditoriaSection />)
    await screen.findByText('login_recusado')

    await user.type(screen.getByLabelText(/buscar/i), 'OP-2026-001')
    await user.click(screen.getByRole('button', { name: /aplicar/i }))

    await waitFor(() =>
      expect(api.listarTrilha).toHaveBeenLastCalledWith(
        expect.objectContaining({ busca: 'OP-2026-001' })
      )
    )
  })

  it('mostra o motivo de um evento negado', async () => {
    render(<AuditoriaSection />)

    expect(await screen.findByText('Senha invalida.')).toBeInTheDocument()
  })

  it('traduz o ator do sistema em vez de mostrar o marcador cru', async () => {
    render(<AuditoriaSection />)
    await screen.findByText('oportunidade_cadastrada')

    expect(screen.queryByText('__sistema__')).not.toBeInTheDocument()
    expect(screen.getByText(/sistema/i)).toBeInTheDocument()
  })

  it('período invertido é recusado antes de ir ao servidor', async () => {
    const user = userEvent.setup({ delay: null })
    render(<AuditoriaSection />)
    await screen.findByText('login_recusado')

    api.listarTrilha.mockClear()

    await user.type(screen.getByLabelText(/^de$/i), '2026-09-30')
    await user.type(screen.getByLabelText(/^até$/i), '2026-09-01')
    await user.click(screen.getByRole('button', { name: /aplicar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/posterior/i)
    expect(api.listarTrilha).not.toHaveBeenCalled()
  })

  it('sem resultado, diz que o filtro não achou — não que não há trilha', async () => {
    api.listarTrilha = vi.fn().mockResolvedValue(pagina([]))
    render(<AuditoriaSection />)

    expect(await screen.findByText(/nenhum evento/i)).toBeInTheDocument()
  })

  it('avisa quando a consulta falha', async () => {
    api.listarTrilha = vi.fn().mockRejectedValue(new Error('fora do ar'))
    render(<AuditoriaSection />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /não foi possível carregar/i
    )
  })

  it('não oferece nenhuma ação de escrita sobre a trilha', async () => {
    render(<AuditoriaSection />)
    await screen.findByText('login_recusado')

    const rotulos = screen
      .getAllByRole('button')
      .map((botao) => botao.textContent.toLowerCase())

    expect(rotulos.some((r) => /excluir|apagar|editar|remover/.test(r))).toBe(false)
  })
})
