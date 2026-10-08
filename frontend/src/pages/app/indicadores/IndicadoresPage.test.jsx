import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IndicadoresPage from './IndicadoresPage'

const api = vi.hoisted(() => ({ obterIndicadores: null }))

vi.mock('../../../services/pdConnectApi', () => ({
  obterIndicadores: (...args) => api.obterIndicadores(...args),
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

beforeEach(() => {
  api.obterIndicadores = vi.fn().mockResolvedValue(DADOS)
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

    expect(texto).not.toMatch(/previs|tendênc|projeç|recomend/)
  })
})
