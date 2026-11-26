import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AbaPreAnalise from './AbaPreAnalise'
import { ROLES } from '../../../../lib/roles'

/**
 * A aba tem um `Link` para o relatorio (PB78), e `Link` exige Router.
 */
function renderizar(props = {}) {
  return render(
    <MemoryRouter>
      <AbaPreAnalise oportunidadeId="OP-2026-001" {...props} />
    </MemoryRouter>,
  )
}

const auth = { user: null, isAuthenticated: true }

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

const api = vi.hoisted(() => ({
  obterPreAnalise: null,
  executarPreAnalise: null,
  acatarRecomendacao: null,
  obterEquipePotencial: null,
  obterProposta: null,
  listarPreAnalises: null,
  obterPreAnaliseDaRodada: null,
}))

vi.mock('../../../../services/pdConnectApi', () => ({
  listarPreAnalises: (...args) => api.listarPreAnalises(...args),
  obterPreAnaliseDaRodada: (...args) => api.obterPreAnaliseDaRodada(...args),
  obterPreAnalise: (...args) => api.obterPreAnalise(...args),
  executarPreAnalise: (...args) => api.executarPreAnalise(...args),
  acatarRecomendacao: (...args) => api.acatarRecomendacao(...args),
  obterEquipePotencial: (...args) => api.obterEquipePotencial(...args),
  obterProposta: (...args) => api.obterProposta(...args),
}))

const AVISO =
  'Análise orientativa do P&D Connect. Não é nota, parecer, aprovação, submissão nem decisão da FAPESP.'

const ANALISE = {
  id_pre_analise: 'pa-1',
  versao_criterios: 'V2',
  versao_proposta: 1,
  sintese: 'Proposta consistente, com lacuna de infraestrutura.',
  executada_em: '2026-10-15T12:00:00Z',
  executada_por: 'supervisor@ac2microbiologia.com.br',
  executada_por_nome: 'Rafael Antunes',
  status: 'ok',
  status_rotulo: 'Concluída',
  erro: '',
  ai_run_id: 'run-9',
  aviso: AVISO,
  dimensoes: [
    {
      id_dimensao: 1,
      dimensao: 'desafio_tecnologico',
      dimensao_rotulo: 'Desafio tecnologico',
      avaliacao: 'O desafio está descrito e é verificável.',
      nivel: 'consolidada',
      nivel_rotulo: 'Consolidada',
      evidencias: ['Metodologia cita controles'],
      ordem: 0,
    },
  ],
  lacunas: [
    { id_lacuna: 4, descricao: 'Não há descrição do laboratório.' },
  ],
  recomendacoes: [
    {
      id_recomendacao: 2,
      origem: 'pre_analise',
      origem_rotulo: 'Pré-análise',
      texto: 'Descrever a infraestrutura disponível.',
      acatada: false,
    },
  ],
}

const estilosDoConsole = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'styles', 'components', '_console.scss'),
  'utf8',
)

const estilosDaPagina = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'OportunidadesPage.scss'),
  'utf8',
)

const FALHA_ATUAL = {
  ...ANALISE,
  id_pre_analise: 'pa-2',
  executada_em: '2026-11-14T12:00:00Z',
  status: 'erro',
  status_rotulo: 'Erro',
  erro: 'execucao_interrompida',
  dimensoes: [],
  lacunas: [],
  recomendacoes: [],
  sintese: '',
}

const RODADA_FALHA = {
  id_pre_analise: 'pa-2',
  executada_em: '2026-11-14T12:00:00Z',
  versao_proposta: 1,
  versao_criterios: 'V2',
  status: 'erro',
  status_rotulo: 'Erro',
  erro: 'execucao_interrompida',
  lacunas: 0,
  recomendacoes: 0,
  recomendacoes_acatadas: 0,
  atual: true,
}

const RODADA_OK_NOVA = {
  id_pre_analise: 'pa-1',
  executada_em: '2026-11-15T12:00:00Z',
  versao_proposta: 1,
  versao_criterios: 'V2',
  status: 'ok',
  status_rotulo: 'Concluída',
  erro: '',
  lacunas: 1,
  recomendacoes: 1,
  recomendacoes_acatadas: 0,
  atual: true,
}

const RODADA_OK_ANTIGA = {
  ...RODADA_OK_NOVA,
  id_pre_analise: 'pa-0',
  executada_em: '2026-11-10T12:00:00Z',
  atual: false,
}

async function abrirOQueMelhorar() {
  const titulo = await screen.findByRole('heading', { name: /o que melhorar/i, level: 3 })
  const bloco = titulo.closest('.preanalise__bloco')

  for (const grupo of within(bloco).queryAllByRole('button', { expanded: false })) {
    await userEvent.click(grupo)
  }

  return bloco
}

describe('AbaPreAnalise', () => {
  beforeEach(() => {
    auth.user = { role: ROLES.SUPERVISOR, name: 'Rafael' }
    api.obterPreAnalise = vi.fn().mockResolvedValue(ANALISE)
    api.executarPreAnalise = vi.fn().mockResolvedValue(ANALISE)
    api.acatarRecomendacao = vi.fn().mockResolvedValue({})
    api.obterEquipePotencial = vi.fn().mockResolvedValue({
      id_equipe: 3,
      membros: [{ id_membro_equipe: 7, incluido: true }],
    })
    api.obterProposta = vi.fn().mockResolvedValue({
      problema_pesquisa: 'Contaminação resiste à pasteurização.',
      revisada_por_humano: true,
    })
    api.listarPreAnalises = vi.fn().mockResolvedValue([])
    api.obterPreAnaliseDaRodada = vi.fn()
  })

  it('apresenta o aviso de que o resultado é orientativo', async () => {
    renderizar()

    expect(await screen.findByText(AVISO)).toBeInTheDocument()
  })

  it('mostra dimensão, nível, lacuna e recomendação', async () => {
    renderizar()

    expect(await screen.findByText('Desafio tecnológico')).toBeInTheDocument()
    expect(screen.getByText('Consolidada')).toBeInTheDocument()
    expect(screen.getByText('Não há descrição do laboratório.')).toBeInTheDocument()
    expect(
      screen.getByText('Descrever a infraestrutura disponível.'),
    ).toBeInTheDocument()
  })

  it('sem rodada anterior, não mostra comparação', async () => {
    renderizar()

    await screen.findByText('Desafio tecnológico')
    expect(screen.queryByText(/em relação à análise anterior/i)).not.toBeInTheDocument()
  })

  it('compara cada dimensão e as lacunas com a análise anterior', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      comparacao: {
        anterior: {
          id_pre_analise: 'pa-0',
          executada_em: '2026-10-01T12:00:00Z',
          versao_proposta: 1,
          versao_criterios: 'V2',
        },
        mesmos_criterios: true,
        dimensoes: [
          {
            dimensao: 'inovacao',
            dimensao_rotulo: 'Inovacao',
            nivel_anterior: 'fragil',
            nivel_atual: 'em_desenvolvimento',
            movimento: 'avancou',
          },
          {
            dimensao: 'viabilidade',
            dimensao_rotulo: 'Viabilidade',
            nivel_anterior: 'consolidada',
            nivel_atual: 'fragil',
            movimento: 'recuou',
          },
        ],
        lacunas: { anterior: 3, atual: 1 },
      },
    })

    renderizar()

    const bloco = (await screen.findByText(/em relação à análise anterior/i)).closest('div')
    expect(within(bloco).getByText('Inovação')).toBeInTheDocument()
    expect(within(bloco).getByText('Avançou')).toBeInTheDocument()
    expect(within(bloco).getByText('Recuou')).toBeInTheDocument()
    expect(within(bloco).getByText(/3 lacunas antes, 1 agora/i)).toBeInTheDocument()
    expect(within(bloco).queryByText(/critérios mudaram/i)).not.toBeInTheDocument()
  })

  /**
   * PB98 e PB100: a comparacao inclui as recomendacoes e mostra quais da
   * analise anterior o Supervisor acatou.
   */
  it('na comparação, identifica as recomendações acatadas da análise anterior', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      comparacao: {
        anterior: { id_pre_analise: 'pa-0', executada_em: '2026-10-01T12:00:00Z', versao_proposta: 1, versao_criterios: 'V2' },
        mesmos_criterios: true,
        dimensoes: [],
        lacunas: { anterior: 3, atual: 1 },
        recomendacoes: {
          anterior: 4,
          atual: 1,
          acatadas_na_anterior: [{ id_recomendacao: 11, texto: 'Descrever o laboratório.' }],
        },
      },
    })

    renderizar()

    const bloco = (await screen.findByText(/em relação à análise anterior/i)).closest('div')
    expect(within(bloco).getByText(/4 recomendações antes, 1 agora/i)).toBeInTheDocument()
    expect(within(bloco).getByText(/acatadas na análise anterior/i)).toBeInTheDocument()
    expect(within(bloco).getByText('Descrever o laboratório.')).toBeInTheDocument()
  })

  it('lista todas as pré-análises e abre uma rodada antiga', async () => {
    api.listarPreAnalises = vi.fn().mockResolvedValue([
      { id_pre_analise: 'pa-1', executada_em: '2026-10-15T12:00:00Z', versao_proposta: 2, versao_criterios: 'V2', status: 'ok', status_rotulo: 'Concluída', lacunas: 1, recomendacoes: 1, recomendacoes_acatadas: 0, atual: true },
      { id_pre_analise: 'pa-0', executada_em: '2026-10-01T12:00:00Z', versao_proposta: 1, versao_criterios: 'V2', status: 'ok', status_rotulo: 'Concluída', lacunas: 3, recomendacoes: 4, recomendacoes_acatadas: 2, atual: false },
    ])
    api.obterPreAnaliseDaRodada = vi.fn().mockResolvedValue({
      ...ANALISE,
      id_pre_analise: 'pa-0',
      executada_em: '2026-10-01T12:00:00Z',
      sintese: 'Rodada antiga, ainda frágil.',
      comparacao: null,
    })
    const user = userEvent.setup()

    renderizar()

    await user.click(await screen.findByRole('button', { name: /todas as pré-análises \(2\)/i }))

    const lista = screen.getByRole('list', { name: /pré-análises desta oportunidade/i })
    const atual = within(lista).getAllByRole('listitem')[0]
    expect(atual).toHaveTextContent('Atual')
    expect(within(atual).queryByRole('button', { name: /ver/i })).not.toBeInTheDocument()

    const antiga = within(lista).getAllByRole('listitem')[1]
    expect(antiga).toHaveTextContent('3 lacunas · 2 de 4 recomendações acatadas')
    await user.click(within(antiga).getByRole('button', { name: /ver a pré-análise de/i }))

    expect(api.obterPreAnaliseDaRodada).toHaveBeenCalledWith('OP-2026-001', 'pa-0')
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Rodada antiga, ainda frágil.')).toBeInTheDocument()
    expect(within(dialogo).queryByRole('button', { name: /marcar como acatada/i })).not.toBeInTheDocument()
  })

  /**
   * A tela mostrava "Frágil" e "Em desenvolvimento" sem dizer o que cada um
   * quer dizer; so o relatorio explicava. O significado vem da API, do mesmo
   * texto do relatorio, e fica a vista, sem abrir "Ver detalhes".
   */
  it('cada dimensão diz o que o nível dela significa', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      dimensoes: [
        {
          ...ANALISE.dimensoes[0],
          nivel: 'fragil',
          nivel_rotulo: 'Frágil',
          nivel_significado: 'está ausente ou pouco demonstrado',
        },
      ],
    })

    renderizar()

    const significado = await screen.findByText('Está ausente ou pouco demonstrado.')

    expect(significado).toBeVisible()
    expect(significado.closest('li')).toHaveTextContent('Frágil')
  })

  /**
   * O botao dividia a linha com o texto da recomendacao e encolhia quando o
   * texto era longo: "Marcar como acatada" quebrava em duas linhas numas
   * recomendacoes e noutras nao, e os botoes saiam de tamanhos diferentes.
   */
  it('o botão da recomendação não encolhe com o texto ao lado', () => {
    const inicio = estilosDaPagina.indexOf('\n.preanalise__recomendacao {')
    const bloco = estilosDaPagina.slice(inicio, estilosDaPagina.indexOf('\n}', inicio))

    expect(inicio).toBeGreaterThan(-1)
    expect(bloco).toMatch(/> \.admin-btn\s*\{[^}]*flex-shrink:\s*0;[^}]*white-space:\s*nowrap;/)
    expect(bloco).toMatch(/> span\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;/)
  })

  /**
   * A rodada antiga abria numa janela de 640 px, estreita para ler dimensões,
   * lacunas e recomendações. Ela abre na janela larga, que ocupa a tela até
   * 1040 px.
   */
  it('a rodada antiga abre na janela larga', async () => {
    api.listarPreAnalises = vi.fn().mockResolvedValue([RODADA_OK_NOVA, RODADA_OK_ANTIGA])
    api.obterPreAnaliseDaRodada = vi.fn().mockResolvedValue({ ...ANALISE, id_pre_analise: 'pa-0' })
    const user = userEvent.setup()

    renderizar()

    await user.click(await screen.findByRole('button', { name: /todas as pré-análises/i }))
    await user.click(screen.getByRole('button', { name: /ver a pré-análise de/i }))

    expect(await screen.findByRole('dialog')).toHaveClass('admin-modal__dialog--xl')
    expect(estilosDoConsole).toMatch(/&--xl\s*\{\s*max-width:\s*1040px;\s*\}/)
  })

  /**
   * A lista dizia só "Erro · Sem resultado", e o Supervisor não sabia por que
   * a rodada falhou. O motivo vem da API em cada rodada.
   */
  it('na lista, a rodada que falhou diz por que não terminou', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue(FALHA_ATUAL)
    api.listarPreAnalises = vi.fn().mockResolvedValue([RODADA_FALHA, RODADA_OK_ANTIGA])
    api.obterPreAnaliseDaRodada = vi.fn().mockResolvedValue({ ...ANALISE, id_pre_analise: 'pa-0' })
    const user = userEvent.setup()

    renderizar()

    await user.click(await screen.findByRole('button', { name: /todas as pré-análises/i }))

    const lista = screen.getByRole('list', { name: /pré-análises desta oportunidade/i })
    const falha = within(lista).getAllByRole('listitem')[0]

    expect(falha).toHaveTextContent(/não produziu resultado: ela passou do tempo esperado sem terminar/i)
    expect(falha).toHaveTextContent('Mais recente')
    expect(falha).not.toHaveTextContent('Atual')
  })

  it('a rodada antiga que falhou diz o motivo ao ser aberta', async () => {
    api.listarPreAnalises = vi.fn().mockResolvedValue([
      RODADA_OK_NOVA,
      { ...RODADA_FALHA, id_pre_analise: 'pa-0', atual: false, erro: 'provedor_indisponivel' },
    ])
    api.obterPreAnaliseDaRodada = vi.fn().mockResolvedValue({
      ...ANALISE,
      id_pre_analise: 'pa-0',
      status: 'erro',
      erro: 'provedor_indisponivel',
      dimensoes: [],
      lacunas: [],
      recomendacoes: [],
      sintese: '',
      comparacao: null,
    })
    const user = userEvent.setup()

    renderizar()

    await user.click(await screen.findByRole('button', { name: /todas as pré-análises/i }))
    await user.click(screen.getByRole('button', { name: /ver a pré-análise de/i }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/o serviço de ia não respondeu/i)).toBeInTheDocument()
  })

  /**
   * A reavaliação de 14/11 falhou, e a aba mostrava só o erro: o resultado
   * válido de 10/11, o que liberou a Decisão, ficava escondido numa lista
   * recolhida. Agora ele aparece abaixo do aviso, só para leitura.
   */
  it('quando a rodada mais recente falha, mostra o último resultado válido, só para leitura', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue(FALHA_ATUAL)
    api.listarPreAnalises = vi.fn().mockResolvedValue([RODADA_FALHA, RODADA_OK_ANTIGA])
    api.obterPreAnaliseDaRodada = vi.fn().mockResolvedValue({
      ...ANALISE,
      id_pre_analise: 'pa-0',
      executada_em: '2026-11-10T12:00:00Z',
      comparacao: null,
    })

    renderizar()

    const valido = await screen.findByRole('region', { name: /último resultado válido/i })

    expect(api.obterPreAnaliseDaRodada).toHaveBeenCalledWith('OP-2026-001', 'pa-0')
    expect(valido).toHaveAccessibleName(/10\/11\/2026/)
    expect(within(valido).getByText('Proposta consistente, com lacuna de infraestrutura.')).toBeInTheDocument()
    expect(within(valido).getByText('Desafio tecnológico')).toBeInTheDocument()
    expect(within(valido).queryByRole('button', { name: /marcar como acatada/i })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/passou do tempo esperado/i)
  })

  it('sem rodada válida antes da falha, não inventa resultado', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue(FALHA_ATUAL)
    api.listarPreAnalises = vi.fn().mockResolvedValue([
      RODADA_FALHA,
      { ...RODADA_FALHA, id_pre_analise: 'pa-0', atual: false },
    ])

    renderizar()

    expect(await screen.findByRole('alert')).toHaveTextContent(/passou do tempo esperado/i)
    await screen.findByRole('button', { name: /todas as pré-análises/i })
    expect(screen.queryByRole('region', { name: /último resultado válido/i })).not.toBeInTheDocument()
    expect(api.obterPreAnaliseDaRodada).not.toHaveBeenCalled()
  })

  it('com uma pré-análise só, não oferece o histórico', async () => {
    api.listarPreAnalises = vi.fn().mockResolvedValue([
      { id_pre_analise: 'pa-1', executada_em: '2026-10-15T12:00:00Z', versao_proposta: 1, versao_criterios: 'V2', status: 'ok', status_rotulo: 'Concluída', lacunas: 1, recomendacoes: 1, recomendacoes_acatadas: 0, atual: true },
    ])

    renderizar()
    await screen.findByText(/em resumo/i)

    expect(screen.queryByRole('button', { name: /todas as pré-análises/i })).not.toBeInTheDocument()
  })

  it('avisa quando as duas rodadas usaram critérios diferentes', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      comparacao: {
        anterior: {
          id_pre_analise: 'pa-0',
          executada_em: '2026-10-01T12:00:00Z',
          versao_proposta: 1,
          versao_criterios: 'V1',
        },
        mesmos_criterios: false,
        dimensoes: [],
        lacunas: { anterior: 1, atual: 1 },
      },
    })

    renderizar()

    expect(await screen.findByText(/critérios mudaram/i)).toBeInTheDocument()
  })

  it('cita a versão dos critérios e da proposta', async () => {
    renderizar()

    expect(await screen.findByText(/Critérios V2/)).toBeInTheDocument()
  })

  /**
   * A linha da execução terminava em "por supervisor@ac2microbiologia.com.br":
   * o e-mail é identificador da conta, não o nome de quem executou.
   */
  it('diz quem executou pelo nome, não pelo e-mail', async () => {
    renderizar()

    expect(await screen.findByText(/por Rafael Antunes/)).toBeInTheDocument()
    expect(screen.queryByText(/supervisor@ac2microbiologia/)).not.toBeInTheDocument()
  })

  it('sem conta para o e-mail gravado, mostra o que foi gravado', async () => {
    api.obterPreAnalise = vi
      .fn()
      .mockResolvedValue({ ...ANALISE, executada_por_nome: null })

    renderizar()

    expect(
      await screen.findByText(/por supervisor@ac2microbiologia\.com\.br/),
    ).toBeInTheDocument()
  })

  it('reavalia pelo botão do Supervisor', async () => {
    renderizar()

    await userEvent.click(await screen.findByRole('button', { name: /reavaliar/i }))

    await waitFor(() =>
      expect(api.executarPreAnalise).toHaveBeenCalledWith('OP-2026-001'),
    )
  })

  it('mostra a pré-análise na fila como andamento, não como falha', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      status: 'pendente',
      status_rotulo: 'Aguardando',
      dimensoes: [],
      lacunas: [],
      recomendacoes: [],
      sintese: '',
    })

    renderizar()

    expect(
      await screen.findByText(/na fila para começar/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/não produziu resultado/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reavaliar/i })).toBeDisabled()
  })

  it('depois de enviar para a fila, acompanha o andamento', async () => {
    api.executarPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      status: 'pendente',
      status_rotulo: 'Aguardando',
      dimensoes: [],
      lacunas: [],
      recomendacoes: [],
      sintese: '',
    })

    renderizar()

    await userEvent.click(await screen.findByRole('button', { name: /reavaliar/i }))

    expect(await screen.findByText(/enviada\. a tela atualiza sozinha/i)).toBeInTheDocument()
    expect(await screen.findByText(/na fila para começar/i)).toBeInTheDocument()
  })

  it('a espera de uma execução em andamento conta desde o início dela', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      status: 'executando',
      status_rotulo: 'Executando',
      executada_em: new Date(Date.now() - 40000).toISOString(),
      dimensoes: [],
      lacunas: [],
      recomendacoes: [],
      sintese: '',
    })

    renderizar()

    expect(await screen.findByText(/está em andamento/i)).toBeInTheDocument()
    expect(screen.getByText(/está demorando mais que o normal/i)).toBeInTheDocument()
  })

  /**
   * O servidor apresenta como interrompida a execução que passou do teto sem
   * terminar. Antes, a tela esperava para sempre, com o Reavaliar travado.
   */
  it('com resultado, oferece o relatório e aponta a decisão como próximo passo', async () => {
    renderizar()

    expect(await screen.findByRole('link', { name: /relatório da pré-análise/i }))
      .toHaveAttribute('href', '/oportunidades/OP-2026-001/relatorio/pre-analise')
    expect(screen.getByText(/depois de acatar as recomendações/i)).toBeInTheDocument()
  })

  /**
   * O avanço era um cartão no meio da página, e o botão laranja do topo era
   * "Reavaliar", que refaz a análise. Agora o próximo passo é o botão
   * principal da barra do fim, como nas outras etapas.
   */
  it('com resultado, a decisão fica na barra de ações e reavaliar é secundário', async () => {
    const irPara = vi.fn()
    renderizar({ irPara })

    const barra = await screen.findByRole('group', { name: 'Ações da etapa' })

    expect(barra).toHaveTextContent(/depois de acatar as recomendações/i)
    expect(screen.getByRole('button', { name: /reavaliar/i })).toHaveClass('admin-btn--outline')

    await userEvent.click(within(barra).getByRole('button', { name: /continuar para decisão/i }))
    expect(irPara).toHaveBeenCalledWith('decisao')
  })

  /**
   * O relatório é da última execução: sem resultado, o botão abria um
   * documento vazio. E o próximo passo mandava acatar recomendações que ainda
   * não existiam.
   */
  it('sem resultado, não oferece o relatório nem o próximo passo', async () => {
    const semResultado = { dimensoes: [], lacunas: [], recomendacoes: [], sintese: '' }
    const casos = [
      { ...ANALISE, ...semResultado, status: 'executando', executada_em: new Date().toISOString() },
      { ...ANALISE, ...semResultado, status: 'pendente', executada_em: new Date().toISOString() },
      { ...ANALISE, ...semResultado, status: 'erro', erro: 'execucao_interrompida' },
    ]

    for (const caso of casos) {
      api.obterPreAnalise = vi.fn().mockResolvedValue(caso)
      const { unmount } = renderizar()

      expect(await screen.findByRole('button', { name: /reavaliar/i })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /relatório da pré-análise/i })).not.toBeInTheDocument()
      expect(screen.queryByText(/depois de acatar as recomendações/i)).not.toBeInTheDocument()

      unmount()
    }
  })

  it('execução interrompida explica o que houve e libera o Reavaliar', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      status: 'erro',
      status_rotulo: 'Erro',
      erro: 'execucao_interrompida',
      dimensoes: [],
      lacunas: [],
      recomendacoes: [],
      sintese: '',
    })

    renderizar()

    const aviso = await screen.findByRole('alert')

    expect(aviso).toHaveTextContent(/passou do tempo esperado sem terminar/i)
    expect(aviso).toHaveTextContent(/reavalie para tentar de novo/i)
    expect(aviso).not.toHaveTextContent(/em alguns minutos/i)
    expect(screen.queryByText(/está em andamento/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reavaliar/i })).toBeEnabled()
  })

  it('não desenha dimensão quando a execução falhou', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      status: 'erro',
      erro: 'provedor_indisponivel',
      dimensoes: [],
      lacunas: [],
      recomendacoes: [],
      sintese: '',
    })

    renderizar()

    expect(
      await screen.findByText(/não produziu resultado/i),
    ).toBeInTheDocument()
    expect(screen.queryByText('Desafio tecnológico')).not.toBeInTheDocument()
  })

  it('explica que o limite de gasto barrou a pré-análise', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      status: 'erro',
      erro: 'limite_da_oportunidade',
      dimensoes: [],
      lacunas: [],
      recomendacoes: [],
      sintese: '',
    })

    renderizar()

    expect(
      await screen.findByText(/esta oportunidade atingiu o limite de gasto com ia/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/tente reavaliar em alguns minutos/i)).not.toBeInTheDocument()
  })

  /**
   * O motivo chegava como código (`provedor_indisponivel`) colado a uma
   * justificativa de engenharia. O Supervisor precisa do que aconteceu e do
   * que fazer, não do nome da constante.
   */
  it('explica a falha em linguagem de gente, sem o código cru', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      status: 'erro',
      erro: 'provedor_indisponivel',
      dimensoes: [],
      lacunas: [],
      recomendacoes: [],
      sintese: '',
    })

    renderizar()

    expect(
      await screen.findByText(/o serviço de ia não respondeu/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/provedor_indisponivel/)).not.toBeInTheDocument()
    expect(screen.queryByText(/relatório simulado/i)).not.toBeInTheDocument()
  })

  it('acentua os rótulos que o servidor manda sem acento', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      dimensoes: [
        {
          ...ANALISE.dimensoes[0],
          dimensao: 'equipe_supervisao',
          dimensao_rotulo: 'Equipe e supervisao',
          nivel: 'fragil',
          nivel_rotulo: 'Fragil',
        },
      ],
    })

    renderizar()

    expect(await screen.findByText('Equipe e supervisão')).toBeInTheDocument()
    expect(screen.getByText('Frágil')).toBeInTheDocument()
    expect(screen.queryByText('Fragil')).not.toBeInTheDocument()
  })

  it('resume as dimensões por nível e conta as lacunas de cada uma', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      lacunas: [
        {
          id_lacuna: 8,
          campo_afetado: 'desafio_tecnologico',
          descricao: 'Falta quantificar a perda atual.',
        },
      ],
    })

    renderizar()

    const dimensao = (
      await screen.findByRole('heading', { name: 'Desafio tecnológico' })
    ).closest('li')
    expect(dimensao).toHaveTextContent('1 lacuna em O que melhorar')
    expect(screen.getByText('1 consolidada')).toBeInTheDocument()
  })

  it('mostra cada lacuna com o critério e a recomendação logo abaixo', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      lacunas: [
        {
          id_lacuna: 8,
          campo_afetado: 'plano_pesquisa',
          descricao: 'Falta o controle negativo.',
          criterio_codigo: 'A3',
          criterio_rotulo: 'Metodologia adequada',
        },
        {
          id_lacuna: 9,
          campo_afetado: 'viabilidade',
          descricao: 'Não há prazo.',
          criterio_codigo: null,
        },
      ],
      recomendacoes: [
        { id_recomendacao: 20, id_lacuna: 8, texto: 'Defina o controle negativo.', acatada: false },
        { id_recomendacao: 21, id_lacuna: 9, texto: 'Monte um cronograma.', acatada: false },
        { id_recomendacao: 22, id_lacuna: null, texto: 'Revise o resumo.', acatada: true },
      ],
    })

    renderizar()

    await abrirOQueMelhorar()

    expect(screen.getByRole('button', { name: /^Plano de pesquisa · 1 lacuna/ })).toBeInTheDocument()

    const ligada = screen.getByText('Falta o controle negativo.').closest('li')
    expect(ligada).toHaveTextContent('Metodologia adequada (A3)')
    expect(within(ligada).getByText('Defina o controle negativo.')).toBeInTheDocument()

    await userEvent.click(within(ligada).getByRole('button', { name: /marcar como acatada/i }))
    await waitFor(() =>
      expect(api.acatarRecomendacao).toHaveBeenCalledWith('OP-2026-001', 20, true),
    )

    const semCriterio = screen.getByText('Não há prazo.').closest('li')
    expect(semCriterio).toHaveTextContent('Sem evidência na proposta')
    expect(within(semCriterio).getByText('Monte um cronograma.')).toBeInTheDocument()

    expect(screen.getByText('Outras recomendações')).toBeInTheDocument()
    expect(screen.getByText(/1 de 3 acatadas/)).toBeInTheDocument()
  })

  /**
   * PB97: a lacuna que veio sem recomendacao e sinalizada, em vez de aparecer
   * sozinha como se nao faltasse nada.
   */
  it('sinaliza a lacuna que veio sem recomendação', async () => {
    api.obterPreAnalise = vi.fn().mockResolvedValue({
      ...ANALISE,
      lacunas: [
        { id_lacuna: 8, campo_afetado: 'plano_pesquisa', descricao: 'Falta o controle negativo.', criterio_codigo: 'A3' },
        { id_lacuna: 9, campo_afetado: 'viabilidade', descricao: 'Não há prazo.', criterio_codigo: null },
      ],
      recomendacoes: [
        { id_recomendacao: 20, id_lacuna: 8, texto: 'Defina o controle negativo.', acatada: false },
      ],
    })

    renderizar()

    const semRecomendacao = (await screen.findByText('Não há prazo.')).closest('li')
    expect(semRecomendacao).toHaveTextContent('A pré-análise não trouxe recomendação para esta lacuna.')

    const comRecomendacao = screen.getByText('Falta o controle negativo.').closest('li')
    expect(comRecomendacao).not.toHaveTextContent('não trouxe recomendação')
  })

  it('avisa que falta a equipe antes de executar sem ela', async () => {
    api.obterPreAnalise = vi
      .fn()
      .mockRejectedValue({ data: { codigo: 'preanalise_inexistente' } })
    api.obterEquipePotencial = vi
      .fn()
      .mockRejectedValue({ data: { codigo: 'equipe_inexistente' } })
    const irPara = vi.fn()

    renderizar({ irPara })

    expect(
      await screen.findByText(/avalia também a equipe/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /executar pré-análise/i })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /ir para equipe potencial/i }))
    expect(irPara).toHaveBeenCalledWith('equipe')
  })

  /**
   * PB50 pede "uma equipe potencial definida": a equipe gerada em que o
   * Supervisor tirou todo mundo não conta, e a API recusa do mesmo jeito.
   */
  it('equipe sem ninguém incluído também trava a execução', async () => {
    api.obterEquipePotencial = vi.fn().mockResolvedValue({
      id_equipe: 3,
      membros: [{ id_membro_equipe: 7, incluido: false }],
    })

    renderizar()

    expect(await screen.findByText(/avalia também a equipe/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reavaliar/i })).toBeDisabled()
  })

  /**
   * PB41: texto do Copiloto sem leitura humana não vale como definitivo. A
   * API recusa a pré-análise; a tela trava o botão e leva à aba Proposta.
   */
  it('proposta não revisada trava a reavaliação', async () => {
    api.obterProposta = vi.fn().mockResolvedValue({
      problema_pesquisa: 'Contaminação resiste à pasteurização.',
      revisada_por_humano: false,
    })

    renderizar()

    expect(await screen.findByText(/ainda não foi revisada/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /reavaliar/i })).toBeDisabled(),
    )
  })

  it('mostra a espera enquanto a pré-análise roda', async () => {
    api.executarPreAnalise = vi.fn(() => new Promise(() => {}))
    const aoOcupar = vi.fn()

    renderizar({ aoOcupar })

    await userEvent.click(await screen.findByRole('button', { name: /reavaliar/i }))

    expect(await screen.findByText(/10 a 30 segundos/i)).toBeInTheDocument()
    expect(screen.getByText('A pré-análise está lendo a proposta e a equipe potencial.'))
      .toBeInTheDocument()
    expect(aoOcupar).toHaveBeenLastCalledWith(true)
  })

  it('sem proposta estruturada, aponta o caminho em vez do erro cru', async () => {
    api.obterPreAnalise = vi.fn().mockRejectedValue({
      message: 'detail: Esta oportunidade ainda nao tem proposta estruturada. codigo: proposta_inexistente',
      data: { codigo: 'proposta_inexistente' },
    })

    renderizar()

    expect(
      await screen.findByText(/ainda não tem proposta estruturada/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/codigo:/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /executar pré-análise/i }),
    ).not.toBeInTheDocument()
  })

  it('explica a ausência de critérios cadastrados', async () => {
    api.obterPreAnalise = vi
      .fn()
      .mockRejectedValue({ data: { codigo: 'preanalise_inexistente' } })
    api.executarPreAnalise = vi.fn().mockRejectedValue({
      data: {
        codigo: 'criterios_ausentes',
        detail: 'Nenhuma versão de critérios da pré-análise está cadastrada.',
      },
    })

    renderizar()

    await userEvent.click(
      await screen.findByRole('button', { name: /executar pré-análise/i }),
    )

    expect(
      await screen.findByText(/Nenhuma versão de critérios/i),
    ).toBeInTheDocument()
  })

  it('marca a recomendação como acatada', async () => {
    renderizar()

    await abrirOQueMelhorar()
    await userEvent.click(
      await screen.findByRole('button', { name: /marcar como acatada/i }),
    )

    await waitFor(() =>
      expect(api.acatarRecomendacao).toHaveBeenCalledWith('OP-2026-001', 2, true),
    )
  })

  it('deixa o Pesquisador somente em leitura', async () => {
    auth.user = { role: ROLES.PESQUISADOR, name: 'Maria' }

    renderizar()

    expect(await screen.findByText(/somente leitura/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /reavaliar/i }),
    ).not.toBeInTheDocument()
  })

  /**
   * Com a pré-análise feita, o aviso só aparecia ao Supervisor; o Pesquisador
   * lia o resultado sem saber que a proposta por trás dele não foi revisada.
   */
  it('o Pesquisador vê que a proposta não foi revisada, sem pedido de revisão (RN-IA01)', async () => {
    auth.user = { role: ROLES.PESQUISADOR, name: 'Maria' }
    api.obterProposta = vi.fn().mockResolvedValue({
      problema_pesquisa: 'Contaminação resiste à pasteurização.',
      revisada_por_humano: false,
    })

    renderizar({ irPara: vi.fn() })

    expect(
      await screen.findByText(/ainda não foi revisada pelo supervisor/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /revisar a proposta/i }),
    ).not.toBeInTheDocument()
  })

  /**
   * PB66: depois de Continuar o sistema recusa nova pré-análise. Acatar
   * recomendação serve para a próxima rodada ler o progresso; sem rodada
   * possível, a tela também deixa de oferecer. O relatório continua.
   */
  it('depois de Continuar, não oferece reavaliar nem acatar, e mantém o relatório (PB66)', async () => {
    renderizar({ situacao: 'continuar' })

    expect(await screen.findByText(/concluiu o fluxo/i)).toBeInTheDocument()
    await abrirOQueMelhorar()
    expect(screen.getByText('Descrever a infraestrutura disponível.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /reavaliar/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /marcar como acatada/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/próximo passo/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /relatório da pré-análise/i })).toBeInTheDocument()
  })

  it('arquivada sem pré-análise, não oferece executar', async () => {
    api.obterPreAnalise = vi
      .fn()
      .mockRejectedValue({ data: { codigo: 'preanalise_inexistente' }, message: 'sem' })

    renderizar({ situacao: 'arquivada' })

    expect(await screen.findByText(/foi arquivada/i)).toBeInTheDocument()
    expect(
      screen.getByText(/nenhuma pré-análise foi executada antes da decisão/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /executar pré-análise/i }),
    ).not.toBeInTheDocument()
  })
})

/**
 * "O que melhorar" listava todas as lacunas abertas, ate 22, cada uma
 * repetindo o nome da dimensao, e a aba pedia muita rolagem. As lacunas ficam
 * agrupadas por dimensao, na ordem das dimensoes avaliadas, com os grupos
 * fechados e a contagem no titulo. O conteudo e o mesmo, a um clique.
 */
describe('AbaPreAnalise — O que melhorar por dimensão', () => {
  const dimensao = (id, chave, nivel, rotulo) => ({
    ...ANALISE.dimensoes[0],
    id_dimensao: id,
    dimensao: chave,
    nivel,
    nivel_rotulo: rotulo,
  })

  const AGRUPADA = {
    ...ANALISE,
    dimensoes: [
      dimensao(1, 'equipe_supervisao', 'fragil', 'Frágil'),
      dimensao(2, 'infraestrutura', 'em_desenvolvimento', 'Em desenvolvimento'),
    ],
    lacunas: [
      { id_lacuna: 31, campo_afetado: 'infraestrutura', descricao: 'Falta o inventário.', criterio_codigo: 'F1', criterio_rotulo: 'Infraestrutura compatível' },
      { id_lacuna: 32, campo_afetado: 'equipe_supervisao', descricao: 'Falta a complementaridade.', criterio_codigo: 'B3', criterio_rotulo: 'Complementaridade' },
      { id_lacuna: 33, campo_afetado: 'equipe_supervisao', descricao: 'Falta equipe própria.', criterio_codigo: 'F2', criterio_rotulo: 'Equipe própria' },
    ],
    recomendacoes: [
      { id_recomendacao: 41, id_lacuna: 31, texto: 'Liste os equipamentos.', acatada: false },
      { id_recomendacao: 42, id_lacuna: 32, texto: 'Explique quem faz o quê.', acatada: true },
      { id_recomendacao: 43, id_lacuna: 33, texto: 'Mostre a equipe própria.', acatada: false },
      { id_recomendacao: 44, id_lacuna: null, texto: 'Revise o resumo.', acatada: false },
    ],
  }

  beforeEach(() => {
    auth.user = { role: ROLES.SUPERVISOR, name: 'Rafael' }
    api.obterPreAnalise = vi.fn().mockResolvedValue(AGRUPADA)
    api.acatarRecomendacao = vi.fn().mockResolvedValue({})
    api.obterEquipePotencial = vi.fn().mockResolvedValue({ id_equipe: 3, membros: [{ id_membro_equipe: 7, incluido: true }] })
    api.obterProposta = vi.fn().mockResolvedValue({ problema_pesquisa: 'Texto.', revisada_por_humano: true })
    api.listarPreAnalises = vi.fn().mockResolvedValue([])
  })

  const blocoDoMelhorar = async () =>
    (await screen.findByRole('heading', { name: /o que melhorar/i, level: 3 })).closest('.preanalise__bloco')

  it('agrupa por dimensão, na ordem das dimensões, com nível e contagem, e com os grupos fechados', async () => {
    renderizar()

    const grupos = within(await blocoDoMelhorar()).getAllByRole('button', { expanded: false })

    expect(grupos.map((grupo) => grupo.textContent)).toEqual([
      'Equipe e supervisão · Frágil · 2 lacunas · 1 de 2 acatadas',
      'Infraestrutura · Em desenvolvimento · 1 lacuna · 0 de 1 acatada',
      'Outras recomendações · 1 recomendação · 0 de 1 acatada',
    ])
    expect(screen.getByText('Falta o inventário.')).not.toBeVisible()
    expect(screen.queryByRole('button', { name: /marcar como acatada/i })).not.toBeInTheDocument()
  })

  it('o grupo aberto mostra lacuna, critério, recomendação e o Marcar como acatada, sem repetir a dimensão', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(await screen.findByRole('button', { name: /^Infraestrutura · Em desenvolvimento/ }))

    const lacuna = screen.getByText('Falta o inventário.').closest('li')
    expect(lacuna).toBeVisible()
    expect(lacuna).toHaveTextContent('Infraestrutura compatível (F1)')
    expect(within(lacuna).getByText('Liste os equipamentos.')).toBeVisible()
    expect(document.querySelector('.preanalise__grupo-dimensao')).toBeNull()

    await user.click(within(lacuna).getByRole('button', { name: /marcar como acatada/i }))
    await waitFor(() => expect(api.acatarRecomendacao).toHaveBeenCalledWith('OP-2026-001', 41, true))
  })

  it('"N lacunas em O que melhorar" abre o grupo da dimensão e leva até ele', async () => {
    const rolar = vi.fn()
    Element.prototype.scrollIntoView = rolar
    const user = userEvent.setup()
    renderizar()

    const cartao = (await screen.findByRole('heading', { name: 'Equipe e supervisão', level: 4 })).closest('li')
    await user.click(within(cartao).getByRole('button', { name: '2 lacunas em O que melhorar' }))

    expect(screen.getByRole('button', { name: /^Equipe e supervisão · Frágil/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Falta equipe própria.')).toBeVisible()
    expect(rolar).toHaveBeenCalled()

    delete Element.prototype.scrollIntoView
  })

  it('a janela de uma rodada antiga usa os mesmos grupos', async () => {
    api.listarPreAnalises = vi.fn().mockResolvedValue([
      { ...RODADA_OK_NOVA },
      { ...RODADA_OK_ANTIGA },
    ])
    api.obterPreAnaliseDaRodada = vi.fn().mockResolvedValue({ ...AGRUPADA, id_pre_analise: 'pa-0', comparacao: null })
    const user = userEvent.setup()
    renderizar()

    await user.click(await screen.findByRole('button', { name: /todas as pré-análises/i }))
    await user.click(screen.getByRole('button', { name: /ver a pré-análise de/i }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('button', { name: /^Equipe e supervisão · Frágil · 2 lacunas/ })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('AbaPreAnalise — resumo na tela', () => {
  it('separa a primeira frase da avaliação do que vai para os detalhes', async () => {
    const { primeiraFrase } = await import('./AbaPreAnalise')

    expect(primeiraFrase('O desafio está descrito. Falta o estado da arte.')).toEqual({
      frase: 'O desafio está descrito.',
      resto: 'Falta o estado da arte.',
    })
    expect(primeiraFrase('Sem ponto final')).toEqual({ frase: 'Sem ponto final', resto: '' })
  })
})
