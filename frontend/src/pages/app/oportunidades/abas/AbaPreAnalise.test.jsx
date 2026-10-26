import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
}))

vi.mock('../../../../services/pdConnectApi', () => ({
  obterPreAnalise: (...args) => api.obterPreAnalise(...args),
  executarPreAnalise: (...args) => api.executarPreAnalise(...args),
  acatarRecomendacao: (...args) => api.acatarRecomendacao(...args),
  obterEquipePotencial: (...args) => api.obterEquipePotencial(...args),
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

describe('AbaPreAnalise', () => {
  beforeEach(() => {
    auth.user = { role: ROLES.SUPERVISOR, name: 'Rafael' }
    api.obterPreAnalise = vi.fn().mockResolvedValue(ANALISE)
    api.executarPreAnalise = vi.fn().mockResolvedValue(ANALISE)
    api.acatarRecomendacao = vi.fn().mockResolvedValue({})
    api.obterEquipePotencial = vi.fn().mockResolvedValue({ id_equipe: 3, membros: [] })
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

  it('reavalia pelo botão do Supervisor', async () => {
    renderizar()

    await userEvent.click(await screen.findByRole('button', { name: /reavaliar/i }))

    await waitFor(() =>
      expect(api.executarPreAnalise).toHaveBeenCalledWith('OP-2026-001'),
    )
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

    const ligada = (await screen.findByText('Falta o controle negativo.')).closest('li')
    expect(ligada).toHaveTextContent('Plano de pesquisa')
    expect(ligada).toHaveTextContent('A3 · Metodologia adequada')
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
      await screen.findByText(/equipe potencial ainda não foi definida/i),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /ir para equipe potencial/i }))
    expect(irPara).toHaveBeenCalledWith('equipe')
  })

  it('mostra a espera enquanto a pré-análise roda', async () => {
    api.executarPreAnalise = vi.fn(() => new Promise(() => {}))
    const aoOcupar = vi.fn()

    renderizar({ aoOcupar })

    await userEvent.click(await screen.findByRole('button', { name: /reavaliar/i }))

    expect(await screen.findByText(/10 a 30 segundos/i)).toBeInTheDocument()
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
