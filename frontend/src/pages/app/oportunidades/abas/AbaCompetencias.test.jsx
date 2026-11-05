import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AbaCompetencias from './AbaCompetencias'
import { ROLES } from '../../../../lib/roles'

const auth = { user: null, isAuthenticated: true }

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

const api = vi.hoisted(() => ({
  listarCompetencias: null,
  derivarCompetencias: null,
  adicionarCompetencia: null,
  atualizarCompetencia: null,
  removerCompetencia: null,
  obterProposta: null,
}))

vi.mock('../../../../services/pdConnectApi', () => ({
  listarCompetencias: (...args) => api.listarCompetencias(...args),
  derivarCompetencias: (...args) => api.derivarCompetencias(...args),
  adicionarCompetencia: (...args) => api.adicionarCompetencia(...args),
  atualizarCompetencia: (...args) => api.atualizarCompetencia(...args),
  removerCompetencia: (...args) => api.removerCompetencia(...args),
  obterProposta: (...args) => api.obterProposta(...args),
}))

const DERIVADA = {
  id_competencia_necessaria: 1,
  descricao: 'Microbiologia de alimentos',
  nivel_importancia: 'essencial',
  nivel_rotulo: 'Essencial',
  derivada_de: 'copiloto',
  derivada_rotulo: 'Derivada pelo Copiloto',
  no_vocabulario: true,
  ai_run_id: 'run-1',
}

const MANUAL = {
  ...DERIVADA,
  id_competencia_necessaria: 2,
  descricao: 'Bioinformática',
  nivel_importancia: 'desejavel',
  nivel_rotulo: 'Desejável',
  derivada_de: 'manual',
  derivada_rotulo: 'Informada manualmente',
  no_vocabulario: false,
  ai_run_id: null,
}

describe('AbaCompetencias', () => {
  beforeEach(() => {
    auth.user = { role: ROLES.SUPERVISOR, name: 'Rafael' }
    api.listarCompetencias = vi.fn().mockResolvedValue([DERIVADA, MANUAL])
    api.derivarCompetencias = vi
      .fn()
      .mockResolvedValue({ criadas: [DERIVADA], fallback_usado: false })
    api.adicionarCompetencia = vi.fn().mockResolvedValue(MANUAL)
    api.atualizarCompetencia = vi.fn().mockResolvedValue(DERIVADA)
    api.removerCompetencia = vi.fn().mockResolvedValue(undefined)
    api.obterProposta = vi.fn().mockResolvedValue({
      problema_pesquisa: 'Contaminação resiste à pasteurização.',
      revisada_por_humano: true,
    })
  })

  /**
   * PB41: a derivação parte da proposta, e texto do Copiloto sem leitura
   * humana não vale como definitivo. A API recusa; a tela trava o botão e
   * diz o que falta.
   */
  it('trava a derivação enquanto a proposta não foi revisada', async () => {
    api.obterProposta = vi.fn().mockResolvedValue({
      problema_pesquisa: 'Contaminação resiste à pasteurização.',
      revisada_por_humano: false,
    })

    render(<AbaCompetencias oportunidadeId="OP-2026-001" />)

    expect(await screen.findByText(/ainda não foi revisada/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /derivar da proposta/i })).toBeDisabled(),
    )
  })

  it('com a proposta revisada, a derivação fica liberada', async () => {
    render(<AbaCompetencias oportunidadeId="OP-2026-001" />)

    await waitFor(() => expect(api.obterProposta).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /derivar da proposta/i })).toBeEnabled()
  })

  it('distingue o que a IA derivou do que foi informado à mão', async () => {
    render(<AbaCompetencias oportunidadeId="OP-2026-001" />)

    expect(await screen.findByText(/Derivada pelo Copiloto/)).toBeInTheDocument()
    expect(screen.getByText(/Informada manualmente/)).toBeInTheDocument()
  })

  it('deriva da proposta pelo botão do Supervisor', async () => {
    render(<AbaCompetencias oportunidadeId="OP-2026-001" />)

    await userEvent.click(
      await screen.findByRole('button', { name: /derivar da proposta/i }),
    )

    await waitFor(() =>
      expect(api.derivarCompetencias).toHaveBeenCalledWith('OP-2026-001'),
    )
  })

  it('avisa quando o provedor está indisponível em vez de inventar lista', async () => {
    api.derivarCompetencias = vi
      .fn()
      .mockResolvedValue({ criadas: [], fallback_usado: true })

    render(<AbaCompetencias oportunidadeId="OP-2026-001" />)

    await userEvent.click(
      await screen.findByRole('button', { name: /derivar da proposta/i }),
    )

    expect(
      await screen.findByText(/nenhuma competência foi derivada/i),
    ).toBeInTheDocument()
  })

  it('explica que o limite de gasto barrou a derivação', async () => {
    api.derivarCompetencias = vi.fn().mockResolvedValue({
      criadas: [],
      fallback_usado: true,
      motivo_fallback: 'limite_do_mes',
    })

    render(<AbaCompetencias oportunidadeId="OP-2026-001" />)

    await userEvent.click(
      await screen.findByRole('button', { name: /derivar da proposta/i }),
    )

    expect(
      await screen.findByText(/a ia não foi chamada: o limite mensal de gasto com ia foi atingido/i),
    ).toBeInTheDocument()
  })

  it('acrescenta competência manualmente', async () => {
    render(<AbaCompetencias oportunidadeId="OP-2026-001" />)

    await userEvent.type(
      await screen.findByLabelText(/acrescentar competência/i),
      'Fermentação industrial',
    )
    await userEvent.click(screen.getByRole('button', { name: /^acrescentar$/i }))

    await waitFor(() =>
      expect(api.adicionarCompetencia).toHaveBeenCalledWith('OP-2026-001', {
        descricao: 'Fermentação industrial',
        nivel_importancia: 'essencial',
      }),
    )
  })

  it('remove a competência que não se aplica', async () => {
    render(<AbaCompetencias oportunidadeId="OP-2026-001" />)

    const botoes = await screen.findAllByRole('button', { name: /remover/i })
    await userEvent.click(botoes[0])

    await waitFor(() =>
      expect(api.removerCompetencia).toHaveBeenCalledWith('OP-2026-001', 1),
    )
  })

  it('manda para a proposta quando ela ainda não existe', async () => {
    api.listarCompetencias = vi
      .fn()
      .mockRejectedValue({ data: { codigo: 'proposta_inexistente' } })

    render(<AbaCompetencias oportunidadeId="OP-2026-001" />)

    expect(
      await screen.findByText(/ainda não tem proposta estruturada/i),
    ).toBeInTheDocument()
  })

  it('deixa o Pesquisador somente em leitura', async () => {
    auth.user = { role: ROLES.PESQUISADOR, name: 'Maria' }

    render(<AbaCompetencias oportunidadeId="OP-2026-001" />)

    expect(await screen.findByText(/somente leitura/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /derivar da proposta/i }),
    ).not.toBeInTheDocument()
  })
})
