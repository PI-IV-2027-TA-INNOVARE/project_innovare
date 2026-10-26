import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OportunidadePage from './OportunidadePage'

const api = vi.hoisted(() => ({
  obterOportunidade: null,
  listarHistorico: null,
  registrarDecisao: null,
  listarAnexos: null,
  obterProposta: null,
  obterEstadoCopiloto: null,
  estruturarComCopiloto: null,
  definirPrioridade: null,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  obterOportunidade: (...args) => api.obterOportunidade(...args),
  listarHistorico: (...args) => api.listarHistorico(...args),
  registrarDecisao: (...args) => api.registrarDecisao(...args),
  listarAnexos: (...args) => api.listarAnexos(...args),
  enviarAnexo: vi.fn(),
  obterProposta: (...args) => api.obterProposta(...args),
  criarProposta: vi.fn(),
  atualizarProposta: vi.fn(),
  obterEstadoCopiloto: (...args) => api.obterEstadoCopiloto(...args),
  estruturarComCopiloto: (...args) => api.estruturarComCopiloto(...args),
  iniciarSessaoCopiloto: vi.fn(),
  responderCopiloto: vi.fn(),
  concluirSessaoCopiloto: vi.fn(),
  definirPrioridade: (...args) => api.definirPrioridade(...args),
}))

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'supervisor', displayName: 'Rafael Antunes' } }),
}))

const OPORTUNIDADE = {
  codigo: 'OP-2026-014',
  titulo: 'Bioinsumo para cana-de-açúcar',
  origem: 'externo',
  resumo: 'Resumo.',
  contexto: 'Contexto.',
  demandante_nome: 'Agroindústria Vale Verde',
  responsavel_nome: 'Rafael Antunes',
  situacao: 'aguardando_decisao',
  prioridade: 'media',
  prioridade_rotulo: 'Média',
  total_anexos: 0,
  ultima_decisao: null,
  criada_em: '2026-08-20T10:00:00.000Z',
  atualizada_em: '2026-09-16T10:00:00.000Z',
}

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/oportunidades/OP-2026-014']}>
      <Routes>
        <Route path="/oportunidades/:id" element={<OportunidadePage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  api.obterOportunidade = vi.fn().mockResolvedValue(OPORTUNIDADE)
  api.listarHistorico = vi.fn().mockResolvedValue({ results: [] })
  api.registrarDecisao = vi.fn().mockResolvedValue(OPORTUNIDADE)
  api.listarAnexos = vi.fn().mockResolvedValue([])
  api.obterProposta = vi.fn().mockResolvedValue(null)
  api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
    sessao: null,
    mensagens: [],
    perguntas: [],
    lacunas: [],
    elementos_vazios: ['metodologia', 'hipotese'],
    base_disponivel: true,
  })
  api.estruturarComCopiloto = vi
    .fn()
    .mockResolvedValue({ preenchidos: ['metodologia'], fallback_usado: false })
  api.definirPrioridade = vi.fn().mockResolvedValue({ ...OPORTUNIDADE, prioridade: 'alta' })
})

describe('OportunidadePage — prioridade na fila', () => {
  /**
   * PB61: a fila do Supervisor indica status e prioridade. Quem define é ele,
   * na própria oportunidade; a escolha vai para a API e fica na trilha.
   */
  it('o Supervisor muda a prioridade pela API', async () => {
    const user = userEvent.setup()
    renderPagina()

    const seletor = await screen.findByRole('combobox', { name: /prioridade/i })
    expect(seletor).toHaveValue('media')

    await user.selectOptions(seletor, 'alta')

    expect(api.definirPrioridade).toHaveBeenCalledWith('OP-2026-014', 'alta')
    expect(await screen.findByText(/prioridade alta na fila/i)).toBeInTheDocument()
  })
})

describe('OportunidadePage — custo de abertura', () => {
  /**
   * O registro e a trilha sao duas idas independentes ao servidor.
   *
   * Em serie, abrir a oportunidade custa a soma das duas; juntas, a mais
   * longa. A evidencia de simultaneidade que nao depende de cronometro: a
   * segunda chamada acontece enquanto a primeira ainda nao respondeu.
   */
  it('pede o registro e o historico ao mesmo tempo', async () => {
    let liberar
    api.obterOportunidade = vi.fn(
      () => new Promise((resolve) => {
        liberar = resolve
      })
    )

    renderPagina()

    await waitFor(() => expect(api.listarHistorico).toHaveBeenCalledWith('OP-2026-014'))

    liberar(OPORTUNIDADE)
    expect(await screen.findByText('Bioinsumo para cana-de-açúcar')).toBeInTheDocument()
  })

  it('o historico indisponivel nao impede a oportunidade de abrir', async () => {
    api.listarHistorico = vi.fn().mockRejectedValue(new Error('trilha fora do ar'))

    renderPagina()

    expect(await screen.findByText('Bioinsumo para cana-de-açúcar')).toBeInTheDocument()
  })
})

describe('OportunidadePage — rodada do Copiloto', () => {
  /**
   * Depois de "Estruturar", a aba chamava `carregar` da página, que punha a
   * página inteira em "Carregando a oportunidade...". A aba desmontava, o
   * resultado da rodada sumia junto e, ao remontar, buscava o estado de novo:
   * três idas ao servidor e uma tela que piscava sem dizer o que aconteceu.
   */
  it('atualiza a oportunidade sem desmontar a aba nem perder o resultado', async () => {
    renderPagina()

    await userEvent.click(await screen.findByRole('button', { name: /^copiloto/i }))
    await userEvent.click(
      await screen.findByRole('button', { name: /estruturar o que falta/i }),
    )

    expect(await screen.findByText(/o copiloto preencheu metodologia/i)).toBeInTheDocument()
    await waitFor(() => expect(api.obterOportunidade).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/carregando a oportunidade/i)).not.toBeInTheDocument()
    expect(screen.getByText(/o copiloto preencheu metodologia/i)).toBeInTheDocument()
    expect(api.obterEstadoCopiloto).toHaveBeenCalledTimes(2)
  })

  it('trava a troca de etapa enquanto a IA trabalha', async () => {
    api.estruturarComCopiloto = vi.fn(() => new Promise(() => {}))

    renderPagina()

    await userEvent.click(await screen.findByRole('button', { name: /^copiloto/i }))
    await userEvent.click(
      await screen.findByRole('button', { name: /estruturar o que falta/i }),
    )

    expect(await screen.findByText(/aguarde a ia terminar/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^decisão/i })).toBeDisabled()
  })
})
