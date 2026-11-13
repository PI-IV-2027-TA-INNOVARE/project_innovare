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
  listarCompetencias: null,
  obterEquipePotencial: null,
  obterPreAnalise: null,
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
  listarCompetencias: (...args) => api.listarCompetencias(...args),
  obterEquipePotencial: (...args) => api.obterEquipePotencial(...args),
  obterPreAnalise: (...args) => api.obterPreAnalise(...args),
}))

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { role: 'supervisor', displayName: 'Rafael Antunes' },
    isAuthenticated: true,
  }),
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

function renderPagina(rota = '/oportunidades/OP-2026-014') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
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
  api.listarCompetencias = vi.fn().mockResolvedValue([])
  api.obterEquipePotencial = vi.fn().mockResolvedValue(null)
  api.obterPreAnalise = vi.fn().mockResolvedValue(null)
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

describe('OportunidadePage — oportunidade que não existe', () => {
  /**
   * Um endereço como /oportunidades/admin caía nesta página, que buscava o
   * código "admin" e dizia "Não foi possível concluir a operação", com
   * "Tentar de novo". Agora o endereço fora do formato do código é página não
   * encontrada, sem ir ao servidor; o código que o servidor não acha, ou que
   * não está no escopo de quem pede, é oportunidade não encontrada; e só a
   * falha do servidor ou da rede oferece tentar de novo.
   */
  it('endereço fora do formato do código é página não encontrada, sem ir ao servidor', async () => {
    renderPagina('/oportunidades/admin')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Página não encontrada' }),
    ).toBeInTheDocument()
    expect(api.obterOportunidade).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /voltar para oportunidades/i })).toHaveAttribute(
      'href',
      '/oportunidades',
    )
    expect(screen.getByRole('link', { name: 'Ir para o painel' })).toHaveAttribute('href', '/painel')
    expect(screen.queryByRole('button', { name: /tentar de novo/i })).not.toBeInTheDocument()
  })

  it('código que o servidor não acha é oportunidade não encontrada', async () => {
    api.obterOportunidade = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Não encontrado.'), { status: 404 }))

    renderPagina()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Oportunidade não encontrada' }),
    ).toBeInTheDocument()
    expect(screen.getByText('OP-2026-014')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /voltar para oportunidades/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /tentar de novo/i })).not.toBeInTheDocument()
  })

  it('falha do servidor ou da rede continua oferecendo tentar de novo', async () => {
    api.obterOportunidade = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('O servidor não respondeu.'), { status: 500 }))

    renderPagina()

    expect(await screen.findByRole('button', { name: /tentar de novo/i })).toBeInTheDocument()
    expect(screen.getByText(/não foi possível carregar a oportunidade/i)).toBeInTheDocument()
    expect(screen.queryByText(/não encontrada/i)).not.toBeInTheDocument()
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

describe('OportunidadePage — andamento das etapas', () => {
  /**
   * A barra só marcava a aba aberta. Agora diz, pela situação da
   * oportunidade, o que já foi feito e onde o fluxo está, com texto e não só
   * com cor.
   */
  it('marca as etapas concluídas e a que está em andamento', async () => {
    api.obterOportunidade = vi.fn().mockResolvedValue({ ...OPORTUNIDADE, situacao: 'matching' })

    renderPagina()

    expect(await screen.findByRole('button', { name: /Competências.*concluída/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Contexto.*concluída/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Equipe potencial.*em andamento/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Decisão$/ })).toBeInTheDocument()
  })

  it('em estruturação, Copiloto e Proposta estão em andamento juntos', async () => {
    api.obterOportunidade = vi.fn().mockResolvedValue({ ...OPORTUNIDADE, situacao: 'estruturacao' })

    renderPagina()

    expect(await screen.findByRole('button', { name: /Copiloto.*em andamento/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Proposta estruturada.*em andamento/ })).toBeInTheDocument()
  })

  it('oportunidade arquivada não mostra andamento', async () => {
    api.obterOportunidade = vi.fn().mockResolvedValue({ ...OPORTUNIDADE, situacao: 'arquivada' })

    renderPagina()

    await screen.findByRole('button', { name: /Contexto/ })
    expect(screen.queryByText('em andamento')).not.toBeInTheDocument()
    expect(screen.queryByText('concluída')).not.toBeInTheDocument()
  })

  /**
   * A linha sob a barra dizia só a posição da aba aberta. Em Contexto, numa
   * oportunidade aguardando decisão, "Etapa 1 de 7" era lido como "a
   * oportunidade está no começo". Agora ela separa a etapa que a pessoa está
   * vendo da etapa em que a oportunidade está.
   */
  it('diz em que etapa a pessoa está e em qual a oportunidade está', async () => {
    renderPagina()

    expect(await screen.findByText('Etapa 7 de 7 · em andamento')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Contexto/ }))

    expect(
      screen.getByText('Etapa 1 de 7 · concluída · a oportunidade está na etapa 7, Decisão'),
    ).toBeInTheDocument()
  })

  it('numa oportunidade arquivada, a linha diz só a posição', async () => {
    api.obterOportunidade = vi.fn().mockResolvedValue({ ...OPORTUNIDADE, situacao: 'arquivada' })

    renderPagina()

    expect(await screen.findByText('Etapa 7 de 7')).toBeInTheDocument()
  })
})

describe('OportunidadePage — abre onde a oportunidade está', () => {
  /**
   * A página abria sempre em Contexto. Quem voltava para trabalhar numa
   * oportunidade adiantada precisava achar sozinho a etapa em que tinha
   * parado. Agora ela abre na etapa em que a oportunidade está; com decisão
   * registrada, na Decisão; de volta para revisão, na Proposta estruturada,
   * que é para onde a aba Decisão já manda retomar.
   */
  it.each([
    ['entrada', 'Contexto'],
    ['estruturacao', 'Copiloto'],
    ['competencias', 'Competências'],
    ['matching', 'Equipe potencial'],
    ['pre_analise', 'Pré-análise'],
    ['aguardando_decisao', 'Decisão'],
    ['revisar', 'Proposta estruturada'],
    ['continuar', 'Decisão'],
    ['arquivada', 'Decisão'],
  ])('em %s, abre na etapa %s', async (situacao, etapa) => {
    api.obterOportunidade = vi.fn().mockResolvedValue({ ...OPORTUNIDADE, situacao })

    renderPagina()

    expect(
      await screen.findByRole('button', { name: new RegExp(`^${etapa}`) }),
    ).toHaveAttribute('aria-current', 'step')
  })

  it('a atualização em segundo plano não tira a pessoa da etapa que ela abriu', async () => {
    renderPagina()

    await userEvent.click(await screen.findByRole('button', { name: /^copiloto/i }))
    await userEvent.click(
      await screen.findByRole('button', { name: /estruturar o que falta/i }),
    )

    await waitFor(() => expect(api.obterOportunidade).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: /^copiloto/i })).toHaveAttribute('aria-current', 'step')
  })

  /**
   * No celular a barra de etapas rola na horizontal. Abrindo na etapa 7, a
   * aba aberta ficava fora da tela, à direita. A barra rola até ela, sem
   * mexer na rolagem vertical da página.
   */
  it('a barra de etapas rola até a aba em que a página abriu', async () => {
    const original = Element.prototype.scrollIntoView
    const rolagens = []
    Element.prototype.scrollIntoView = function rolar(opcoes) {
      rolagens.push({ alvo: this, opcoes })
    }

    try {
      renderPagina()

      const decisao = await screen.findByRole('button', { name: /^Decisão/ })

      await waitFor(() => expect(rolagens.map((item) => item.alvo)).toContain(decisao))
      expect(rolagens.find((item) => item.alvo === decisao).opcoes).toEqual({
        block: 'nearest',
        inline: 'nearest',
      })
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })
})
