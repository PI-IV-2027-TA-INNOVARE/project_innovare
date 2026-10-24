import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IndicadoresPage from './IndicadoresPage'
import { ROLES } from '../../../lib/roles'

const auth = { user: null, isAuthenticated: true }

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

const api = vi.hoisted(() => ({
  obterIndicadores: null,
  obterIndicadoresDeIA: null,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  obterIndicadores: (...args) => api.obterIndicadores(...args),
  obterIndicadoresDeIA: (...args) => api.obterIndicadoresDeIA(...args),
}))

const contagem = (valor, rotulo, total) => ({ valor, rotulo, total })

const DADOS = {
  oportunidades: {
    total: 7,
    por_situacao: [
      contagem('entrada', 'Entrada', 3),
      contagem('estruturacao', 'Em estruturação', 0),
      contagem('matching', 'Matching', 4),
    ],
    por_origem: [
      contagem('externo', 'Problema externo', 5),
      contagem('interna', 'Ideia interna', 2),
    ],
  },
  decisoes: {
    total: 2,
    por_tipo: [
      contagem('continuar', 'Continuar', 1),
      contagem('revisar', 'Revisar', 1),
      contagem('arquivar', 'Arquivar', 0),
    ],
  },
  rede: {
    total: 9,
    por_papel: [
      contagem('supervisor', 'Supervisor', 2),
      contagem('pesquisador', 'Pesquisador', 7),
    ],
  },
}

const renderizar = () =>
  render(
    <MemoryRouter>
      <IndicadoresPage />
    </MemoryRouter>
  )

const bloco = (nome) =>
  screen.getByRole('region', { name: new RegExp(nome, 'i') })

const DADOS_IA = {
  matching: {
    houve_rodada: true,
    execucoes: 2,
    execucoes_concluidas: 2,
    execucoes_com_rerank: 0,
    execucoes_sem_base_semantica: 2,
    equipes_geradas: 2,
    indicacoes: 5,
    indicacoes_sugeridas: 4,
    indicacoes_manuais: 1,
    indicacoes_incluidas: 5,
    indicacoes_validadas: 3,
    score_medio: 0.62,
    competencias_demandadas: 4,
    competencias_essenciais: 3,
    competencias_no_vocabulario: 2,
    competencias_cobertas: 3,
    competencias_com_lacuna: 1,
    cobertura_percentual: 75.0,
    rede: {
      total: 9,
      por_disponibilidade: [
        contagem('integral', 'Integral', 4),
        contagem('parcial', 'Parcial', 5),
        contagem('pontual', 'Pontual / consultiva', 0),
        contagem('indisponivel', 'Indisponivel no momento', 0),
      ],
    },
  },
  maturidade: {
    houve_execucao: true,
    execucoes: 3,
    execucoes_concluidas: 3,
    execucoes_com_erro: 0,
    propostas_analisadas: 2,
    dimensoes_avaliadas: 12,
    por_nivel: [
      contagem('consolidada', 'Consolidada', 5),
      contagem('em_desenvolvimento', 'Em desenvolvimento', 4),
      contagem('fragil', 'Fragil', 3),
    ],
    por_dimensao: [contagem('inovacao', 'Inovacao', 3)],
    frageis_por_dimensao: [contagem('infraestrutura', 'Infraestrutura', 2)],
    lacunas: 6,
    lacunas_abertas: 4,
    recomendacoes: 5,
    recomendacoes_acatadas: 2,
    versao_criterios: 'V2',
  },
}

beforeEach(() => {
  auth.user = { role: ROLES.SUPERVISOR, name: 'Rafael' }
  api.obterIndicadores = vi.fn().mockResolvedValue(DADOS)
  api.obterIndicadoresDeIA = vi.fn().mockResolvedValue(DADOS_IA)
})

describe('Indicadores essenciais', () => {
  it('mostra o total de oportunidades do escopo de quem olha', async () => {
    renderizar()

    const oportunidades = await screen.findByRole('region', {
      name: /oportunidades/i,
    })

    expect(within(oportunidades).getByText('7')).toBeInTheDocument()
  })

  it('mostra cada etapa do fluxo com o rótulo do servidor', async () => {
    renderizar()
    const oportunidades = await screen.findByRole('region', {
      name: /oportunidades/i,
    })

    expect(within(oportunidades).getByText('Em estruturação')).toBeInTheDocument()
    expect(within(oportunidades).getByText('Matching')).toBeInTheDocument()
  })

  it('mantém visível a etapa zerada', async () => {
    /**
     * Etapa que some lê-se como "não existe", e não como "ninguém está nela"
     * — que é a leitura que interessa a quem acompanha o fluxo.
     */
    renderizar()
    const oportunidades = await screen.findByRole('region', {
      name: /oportunidades/i,
    })

    const linha = within(oportunidades).getByRole('listitem', {
      name: /em estruturação/i,
    })

    expect(within(linha).getByText('0')).toBeInTheDocument()
  })

  it('mostra as decisões registradas', async () => {
    renderizar()
    await screen.findByRole('region', { name: /oportunidades/i })

    expect(within(bloco('decisões')).getByText('Continuar')).toBeInTheDocument()
  })

  it('mostra a rede quando o servidor a envia', async () => {
    renderizar()
    await screen.findByRole('region', { name: /oportunidades/i })

    expect(within(bloco('rede interna')).getByText('9')).toBeInTheDocument()
  })

  it('omite a rede para quem não a consulta, sem deixar bloco vazio', async () => {
    api.obterIndicadores = vi.fn().mockResolvedValue({ ...DADOS, rede: null })
    renderizar()
    await screen.findByRole('region', { name: /oportunidades/i })

    expect(
      screen.queryByRole('region', { name: /rede interna/i })
    ).not.toBeInTheDocument()
  })

  it('sem nenhuma oportunidade, explica em vez de mostrar zeros soltos', async () => {
    api.obterIndicadores = vi.fn().mockResolvedValue({
      oportunidades: { total: 0, por_situacao: [], por_origem: [] },
      decisoes: { total: 0, por_tipo: [] },
      rede: null,
    })
    renderizar()

    expect(await screen.findByText(/nenhuma oportunidade/i)).toBeInTheDocument()
  })

  it('avisa quando os números não carregam', async () => {
    api.obterIndicadores = vi.fn().mockRejectedValue(new Error('fora do ar'))
    renderizar()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /não foi possível carregar/i
    )
  })

  it('não promete análise que o produto não faz', async () => {
    renderizar()
    await screen.findByRole('region', { name: /oportunidades/i })

    const texto = document.body.textContent.toLowerCase()

    expect(texto).not.toMatch(/previs|tendênc|projeç/)
  })

  it('"recomendações" aqui é contagem do que a pré-análise produziu', async () => {
    /**
     * O termo entrou na tela com o bloco de maturidade (PB75) e nao e promessa
     * de analise preditiva: e quantas recomendacoes a pre-analise gerou e
     * quantas foram acatadas. A proibicao do teste acima continua valendo para
     * previsao, tendencia e projecao.
     */
    renderizar()

    const bloco = await screen.findByRole('region', { name: /maturidade/i })

    expect(within(bloco).getByText('Recomendações')).toBeInTheDocument()
    expect(within(bloco).getByText('Acatadas')).toBeInTheDocument()
  })
})

describe('Indicadores de matching e maturidade (PB74, PB75)', () => {
  it('mostra a cobertura da rede sobre as competências demandadas', async () => {
    renderizar()

    const bloco = await screen.findByRole('region', { name: /matching/i })

    expect(within(bloco).getByText('75%')).toBeInTheDocument()
    expect(within(bloco).getByText(/com lacuna/i)).toBeInTheDocument()
  })

  it('separa o que a IA sugeriu do que o Supervisor incluiu', async () => {
    renderizar()

    const bloco = await screen.findByRole('region', { name: /matching/i })

    expect(within(bloco).getByText(/sugeridas pelo matching/i)).toBeInTheDocument()
    expect(within(bloco).getByText(/incluídas pelo supervisor/i)).toBeInTheDocument()
  })

  it('conta dimensões por nível e cita a versão dos critérios', async () => {
    renderizar()

    const bloco = await screen.findByRole('region', { name: /maturidade/i })

    expect(within(bloco).getByText(/critérios v2/i)).toBeInTheDocument()
    expect(within(bloco).getByText('Consolidada')).toBeInTheDocument()
  })

  it('não apresenta nota, pontuação nem índice de maturidade', async () => {
    renderizar()

    const bloco = await screen.findByRole('region', { name: /maturidade/i })
    const rotulos = within(bloco)
      .getAllByRole('listitem')
      .map((item) => item.textContent.toLowerCase())
      .join(' ')

    expect(rotulos).not.toMatch(/nota|parecer|pontuaç|índice|media|média/)
    expect(bloco.textContent).toMatch(/não é nota nem parecer/i)
  })

  it('declara a ausência de rodada em vez de mostrar zeros', async () => {
    api.obterIndicadoresDeIA = vi.fn().mockResolvedValue({
      matching: { houve_rodada: false },
      maturidade: { houve_execucao: false },
    })

    renderizar()

    const bloco = await screen.findByRole('region', { name: /matching/i })

    expect(within(bloco).getByText(/nenhuma rodada de matching/i)).toBeInTheDocument()
  })

  it('não busca os blocos de IA para quem não é Supervisor', async () => {
    auth.user = { role: ROLES.PESQUISADOR, name: 'Maria' }

    renderizar()
    await screen.findByRole('region', { name: /oportunidades/i })

    expect(api.obterIndicadoresDeIA).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: /matching/i })).not.toBeInTheDocument()
  })

  it('mantém os números essenciais quando os blocos de IA falham', async () => {
    api.obterIndicadoresDeIA = vi.fn().mockRejectedValue(new Error('falhou'))

    renderizar()

    expect(
      await screen.findByRole('region', { name: /oportunidades/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(/não foi possível carregar os indicadores de matching/i),
    ).toBeInTheDocument()
  })
})
