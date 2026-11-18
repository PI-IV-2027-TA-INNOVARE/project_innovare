import { render, screen, waitFor, within } from '@testing-library/react'
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
  executarMatching: null,
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
  executarMatching: (...args) => api.executarMatching(...args),
  ajustarMembroEquipe: vi.fn(),
  adicionarMembroEquipe: vi.fn(),
  validarEquipe: vi.fn(),
  listarRede: vi.fn(() => Promise.resolve({ results: [] })),
  obterPreAnalise: (...args) => api.obterPreAnalise(...args),
  listarPreAnalises: vi.fn(() => Promise.resolve([])),
  obterPreAnaliseDaRodada: vi.fn(),
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

function propostaNaoIniciada() {
  const erro = new Error('Esta oportunidade ainda não tem proposta estruturada.')
  erro.status = 404
  erro.data = { detail: erro.message, codigo: 'proposta_inexistente' }
  return erro
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
  api.obterProposta = vi.fn().mockRejectedValue(propostaNaoIniciada())
  api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
    sessao: {
      id_sessao: 'abc',
      estado: 'aberta',
      sintese: 'Problema: lotes perdidos por contaminação.',
      sintese_conferida: true,
    },
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

describe('OportunidadePage — matching sem travar as etapas', () => {
  /**
   * A rodada do matching travava todas as etapas e passou de 80 s. Agora a
   * página guarda a rodada: a pessoa troca de etapa, volta e vê a espera, e
   * um aviso diz quando a equipe ficou pronta.
   */
  it('a pessoa segue em outra etapa e é avisada quando a equipe fica pronta', async () => {
    let liberar
    api.executarMatching = vi.fn(
      () =>
        new Promise((resolve) => {
          liberar = resolve
        }),
    )
    api.obterEquipePotencial = vi
      .fn()
      .mockRejectedValue({ data: { codigo: 'equipe_inexistente' }, message: 'sem equipe' })
    api.listarCompetencias = vi.fn().mockResolvedValue([{ id_competencia_necessaria: 1 }])

    renderPagina()

    await userEvent.click(await screen.findByRole('button', { name: /^equipe potencial/i }))
    await userEvent.click(await screen.findByRole('button', { name: /rodar matching/i }))

    expect(await screen.findByText(/pode seguir para outra etapa/i)).toBeInTheDocument()
    expect(screen.queryByText(/aguarde a ia terminar/i)).toBeNull()
    expect(screen.getByRole('button', { name: /^decisão/i })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: /^contexto/i }))
    await userEvent.click(screen.getByRole('button', { name: /^equipe potencial/i }))

    expect(await screen.findByText(/pode seguir para outra etapa/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /rodando/i })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /^contexto/i }))
    liberar({ equipe: { membros: [] }, avaliados: 3 })

    expect(await screen.findByText(/a equipe potencial ficou pronta/i)).toBeInTheDocument()
    expect(api.executarMatching).toHaveBeenCalledTimes(1)
  })
})

describe('OportunidadePage — cabeçalho', () => {
  /**
   * Código, origem, situação, prioridade, demandante e data dividiam uma linha
   * só e disputavam a atenção com o título. Agora quem é a oportunidade fica
   * numa linha, e em que pé ela está, na seguinte.
   */
  it('separa quem é a oportunidade de em que pé ela está', async () => {
    const { container } = renderPagina()

    await screen.findByRole('heading', { level: 1, name: 'Bioinsumo para cana-de-açúcar' })

    const identidade = container.querySelector('.oportunidade-page__identidade')
    const estado = container.querySelector('.oportunidade-page__meta')

    expect(identidade).toHaveTextContent('OP-2026-014')
    expect(identidade).toHaveTextContent('Agroindústria Vale Verde')
    expect(within(estado).getByRole('combobox', { name: /prioridade/i })).toBeInTheDocument()
    expect(estado).toHaveTextContent(/atualizada/i)
    expect(estado).not.toHaveTextContent('Agroindústria Vale Verde')
    expect(estado).not.toHaveTextContent('OP-2026-014')
  })
})

describe('OportunidadePage — do Copiloto ao elemento da proposta', () => {
  it('o ponto apontado pelo Copiloto abre a proposta no elemento dele', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
      sessao: { id_sessao: 'abc', estado: 'aberta', sintese: 'Resumo.', sintese_conferida: true },
      mensagens: [],
      perguntas: [],
      lacunas: [
        {
          id_lacuna: 9,
          campo_afetado: 'metodologia',
          natureza: 'pouco_desenvolvido',
          natureza_rotulo: 'Pouco desenvolvido',
          descricao: 'Faltam os controles.',
          recomendacao: 'Descreva o controle positivo e o negativo.',
          severidade: 'media',
          severidade_rotulo: 'Média',
        },
      ],
      elementos_vazios: [],
      base_disponivel: true,
    })
    api.obterProposta = vi.fn().mockResolvedValue({
      id_proposta: 1,
      problema_pesquisa: 'Perda de lotes.',
      hipotese: '',
      objetivo_geral: 'Reduzir a perda.',
      objetivos_especificos: ['Medir a perda'],
      metodologia: 'Cultivo seletivo.',
      resultados_esperados: 'Protocolo.',
      caracterizacao_inovacao: 'Mais rápido.',
      infraestrutura_recursos: 'Laboratório.',
      revisada_por_humano: true,
      revisor_nome: 'Rafael Antunes',
    })

    renderPagina()

    await userEvent.click(await screen.findByRole('button', { name: /^copiloto/i }))
    await userEvent.click(await screen.findByRole('button', { name: /editar na proposta/i }))

    const campo = await screen.findByLabelText(/metodologia/i)

    await waitFor(() => expect(campo).toHaveFocus())
    expect(screen.getByRole('button', { name: /proposta estruturada/i })).toHaveAttribute(
      'aria-current',
      'step',
    )
  })

  it('sair do Copiloto com resposta não enviada pede confirmação', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderPagina()

    await userEvent.click(await screen.findByRole('button', { name: /^copiloto/i }))
    await userEvent.type(
      await screen.findByLabelText(/outra informação para o copiloto/i),
      'Mais contexto.',
    )
    await userEvent.click(screen.getByRole('button', { name: /^contexto/i }))

    expect(confirmar).toHaveBeenCalledWith(
      expect.stringMatching(/respostas ao copiloto que não foram enviadas/i),
    )
    expect(screen.getByLabelText(/outra informação para o copiloto/i)).toHaveValue('Mais contexto.')

    confirmar.mockRestore()
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
      screen.getByText('Você está vendo a etapa 1 de 7, já concluída. Etapa atual: 7, Decisão.'),
    ).toBeInTheDocument()
  })

  /**
   * "Etapa 2 de 7 · concluída · a oportunidade está na etapa 7, Decisão"
   * obrigava a pessoa a decifrar a frase. Agora ela diz o que a pessoa vê,
   * qual é a etapa atual e leva até ela.
   */
  it('fora da etapa atual, oferece voltar a ela', async () => {
    renderPagina()

    await userEvent.click(await screen.findByRole('button', { name: /^Contexto/ }))
    await userEvent.click(screen.getByRole('button', { name: /ir para a etapa atual/i }))

    expect(screen.getByRole('button', { name: /^Decisão/ })).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByRole('button', { name: /ir para a etapa atual/i })).toBeNull()
  })

  it('numa etapa que ainda não começou, diz isso em vez de um estado', async () => {
    api.obterOportunidade = vi.fn().mockResolvedValue({ ...OPORTUNIDADE, situacao: 'estruturacao' })

    renderPagina()

    await userEvent.click(await screen.findByRole('button', { name: /^Competências/ }))

    expect(
      screen.getByText('Você está vendo a etapa 4 de 7, que ainda não começou. Etapa atual: 2, Copiloto.'),
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
        inline: 'center',
      })
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  /**
   * No celular a barra cortava uma aba no meio ("ipe potencial") e deixava
   * Anexos e Histórico fora da tela, sem nenhum sinal de que havia mais etapas.
   */
  it('quando a barra de etapas não cabe, mostra que há mais etapas e rola até elas', async () => {
    renderPagina()

    const barra = await screen.findByRole('navigation', { name: 'Etapas da oportunidade' })
    const rolar = vi.fn()
    Object.defineProperties(barra, {
      scrollWidth: { configurable: true, value: 1200 },
      clientWidth: { configurable: true, value: 360 },
      scrollLeft: { configurable: true, value: 0, writable: true },
    })
    barra.scrollBy = rolar

    barra.dispatchEvent(new Event('scroll'))

    const mais = await screen.findByLabelText('Ver mais etapas')
    expect(screen.queryByLabelText('Ver etapas anteriores')).not.toBeInTheDocument()

    await userEvent.click(mais)
    expect(rolar).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
    expect(rolar.mock.calls[0][0].left).toBeGreaterThan(0)
  })

  it('a volta para a lista é um botão, não um link apagado', async () => {
    renderPagina()

    await screen.findByRole('navigation', { name: 'Etapas da oportunidade' })

    expect(screen.getByRole('link', { name: /voltar para oportunidades/i })).toHaveClass(
      'admin-btn',
      'admin-btn--outline',
    )
  })
})
