import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IndicadoresPage from './IndicadoresPage'
import { TERMOS } from '../../../lib/glossario'
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
      contagem('continuar', 'Continuar', 0),
      contagem('arquivada', 'Arquivada', 0),
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

const numeroDoResumo = (legenda) =>
  within(bloco('resumo')).getByText(legenda).closest('div')

const linhaDe = (regiao, rotulo) => within(regiao).getByText(rotulo).closest('li')

const valorDe = (regiao, rotulo) => within(regiao).getByText(rotulo).closest('div')

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
    await screen.findByRole('region', { name: /oportunidades/i })

    expect(numeroDoResumo('oportunidades')).toHaveTextContent('7')
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

    expect(linhaDe(oportunidades, 'Em estruturação')).toHaveTextContent('0')
  })

  it('mostra as decisões registradas', async () => {
    renderizar()
    await screen.findByRole('region', { name: /oportunidades/i })

    expect(within(bloco('decisões')).getByText('Continuar')).toBeInTheDocument()
    expect(numeroDoResumo('decisões registradas')).toHaveTextContent('2')
  })

  it('mostra a rede quando o servidor a envia', async () => {
    renderizar()
    await screen.findByRole('region', { name: /oportunidades/i })

    expect(within(bloco('rede interna')).getByText('Pesquisador')).toBeInTheDocument()
    expect(numeroDoResumo('pessoas na rede interna')).toHaveTextContent('9')
  })

  it('omite a rede para quem não a consulta, sem deixar bloco vazio', async () => {
    api.obterIndicadores = vi.fn().mockResolvedValue({ ...DADOS, rede: null })
    renderizar()
    await screen.findByRole('region', { name: /oportunidades/i })

    expect(
      screen.queryByRole('region', { name: /rede interna/i })
    ).not.toBeInTheDocument()
    expect(within(bloco('resumo')).queryByText('pessoas na rede interna')).not.toBeInTheDocument()
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

    expect(valorDe(bloco, 'Recomendações que o Supervisor acatou')).toHaveTextContent('2 de 5')
  })

  it('diz quando os números foram lidos', async () => {
    renderizar()
    await screen.findByRole('region', { name: /oportunidades/i })

    const atualizado = screen.getByText(
      (_, elemento) =>
        elemento?.tagName === 'P' && /^atualizado às \d{2}:\d{2}$/i.test(elemento.textContent)
    )

    expect(atualizado.querySelector('time')).toHaveAttribute('dateTime')
  })
})

describe('Leitura dos números', () => {
  it('cada número do resumo vem com a legenda do que ele conta', async () => {
    renderizar()
    await screen.findByRole('region', { name: /maturidade/i })

    expect(numeroDoResumo('oportunidades')).toHaveTextContent('7')
    expect(numeroDoResumo('cobertura das competências')).toHaveTextContent('75%')
    expect(numeroDoResumo('pré-análises executadas')).toHaveTextContent('3')
  })

  it('a etapa com oportunidades leva à lista já filtrada', async () => {
    renderizar()
    const oportunidades = await screen.findByRole('region', { name: /oportunidades/i })

    expect(within(oportunidades).getByRole('link', { name: /matching\s*4/i })).toHaveAttribute(
      'href',
      '/oportunidades?situacao=matching'
    )
  })

  it('a etapa vazia não vira link para uma lista vazia', async () => {
    renderizar()
    const oportunidades = await screen.findByRole('region', { name: /oportunidades/i })

    expect(
      within(oportunidades).queryByRole('link', { name: /em estruturação/i })
    ).not.toBeInTheDocument()
  })

  it('para o Demandante, a etapa leva aos problemas dele', async () => {
    auth.user = { role: ROLES.DEMANDANTE, name: 'Vale Verde' }
    renderizar()
    const oportunidades = await screen.findByRole('region', { name: /oportunidades/i })

    expect(within(oportunidades).getByRole('link', { name: /entrada\s*3/i })).toHaveAttribute(
      'href',
      '/problemas?situacao=entrada'
    )
  })

  it('a barra de cada etapa é proporcional ao total', async () => {
    renderizar()
    const oportunidades = await screen.findByRole('region', { name: /oportunidades/i })

    const barra = (rotulo) =>
      linhaDe(oportunidades, rotulo).querySelector('.fluxo__barra')

    expect(barra('Entrada').style.width).toBe('43%')
    expect(barra('Matching').style.width).toBe('57%')
    expect(barra('Em estruturação').style.width).toBe('0%')
  })

  it('o fluxo separa as etapas em andamento das que já têm decisão', async () => {
    renderizar()
    await screen.findByRole('region', { name: /oportunidades/i })

    const emAndamento = screen.getByRole('list', { name: 'Em andamento' })
    const comDecisao = screen.getByRole('list', { name: 'Com decisão' })

    expect(within(emAndamento).getByText('Entrada')).toBeInTheDocument()
    expect(within(comDecisao).getByText('Arquivada')).toBeInTheDocument()
    expect(within(emAndamento).queryByText('Arquivada')).not.toBeInTheDocument()
  })

  it('as decisões cabem numa barra só, dividida na proporção de cada encaminhamento', async () => {
    renderizar()
    await screen.findByRole('region', { name: /oportunidades/i })

    const decisoes = bloco('decisões')
    const larguras = [...decisoes.querySelectorAll('.composicao__segmento')].map(
      (segmento) => segmento.style.width
    )

    expect(larguras).toEqual(['50%', '50%'])
    expect(linhaDe(decisoes, 'Arquivar')).toHaveTextContent('0')
  })

  it('escreve porcentagem com vírgula, como se lê em português', async () => {
    api.obterIndicadoresDeIA = vi.fn().mockResolvedValue({
      ...DADOS_IA,
      matching: { ...DADOS_IA.matching, cobertura_percentual: 81.6 },
    })
    renderizar()
    await screen.findByRole('region', { name: /matching/i })

    expect(numeroDoResumo('cobertura das competências')).toHaveTextContent('81,6%')
  })

  it('as competências demandadas cabem numa barra: com alguém na equipe e com lacuna', async () => {
    renderizar()

    const matching = await screen.findByRole('region', { name: /matching/i })
    const larguras = [...matching.querySelectorAll('.composicao__segmento')].map(
      (segmento) => segmento.style.width
    )

    expect(linhaDe(matching, 'Com alguém na equipe')).toHaveTextContent('3')
    expect(linhaDe(matching, 'Lacuna de competência')).toHaveTextContent('1')
    expect(larguras).toEqual(['75%', '25%'])
  })

  it('mostra a proporção pronta em vez de dois números para comparar', async () => {
    renderizar()

    const matching = await screen.findByRole('region', { name: /matching/i })
    const maturidade = bloco('maturidade')

    expect(valorDe(matching, 'Em equipe já validada')).toHaveTextContent('3 de 5')
    expect(valorDe(maturidade, 'Lacunas da pré-análise em aberto')).toHaveTextContent('4 de 6')
  })

  it('o leitor de tela ouve o rótulo junto com o número', async () => {
    renderizar()
    const oportunidades = await screen.findByRole('region', { name: /oportunidades/i })

    for (const item of within(oportunidades).getAllByRole('listitem')) {
      expect(item).not.toHaveAttribute('aria-label')
    }
  })

  it('o Demandante não vê a origem, que para ele é sempre a mesma', async () => {
    auth.user = { role: ROLES.DEMANDANTE, name: 'Vale Verde' }
    renderizar()
    const oportunidades = await screen.findByRole('region', { name: /oportunidades/i })

    expect(within(oportunidades).queryByText('Por origem')).not.toBeInTheDocument()
  })

  it('quem acompanha o fluxo vê de onde as oportunidades vieram', async () => {
    renderizar()
    const oportunidades = await screen.findByRole('region', { name: /oportunidades/i })

    expect(within(oportunidades).getByText('Por origem')).toBeInTheDocument()
    expect(within(oportunidades).getByText('Ideia interna')).toBeInTheDocument()
  })
})

describe('Rótulos que se explicam sozinhos', () => {
  const textoDe = (regiao) => regiao.textContent.replace(/\s+/g, ' ')

  it('a cobertura vem numa frase que diz o que foi contado', async () => {
    renderizar()

    const matching = await screen.findByRole('region', { name: /matching/i })

    expect(textoDe(matching)).toContain(
      'Das 4 competências que as propostas pedem, 3 (75%) têm alguém na equipe sugerida.'
    )
  })

  it('"lacuna" sempre diz de qual lacuna se trata', async () => {
    renderizar()

    const matching = await screen.findByRole('region', { name: /matching/i })
    const maturidade = bloco('maturidade')

    expect(textoDe(matching)).toMatch(/lacuna de competência/i)
    expect(textoDe(maturidade)).toMatch(/lacunas da pré-análise/i)
    expect(textoDe(matching)).not.toMatch(/com lacuna/i)
    expect(textoDe(maturidade)).not.toMatch(/lacunas em aberto/i)
  })

  it('as indicações dizem que contam pessoas', async () => {
    renderizar()

    const matching = await screen.findByRole('region', { name: /matching/i })

    expect(within(matching).getByText('Pessoas indicadas')).toBeInTheDocument()
    expect(valorDe(matching, 'Em equipe já validada')).toHaveTextContent('3 de 5')
  })

  it('as essenciais aparecem como parte das demandadas', async () => {
    renderizar()

    const matching = await screen.findByRole('region', { name: /matching/i })

    expect(valorDe(matching, 'Marcadas como essenciais')).toHaveTextContent('3 de 4')
  })

  it('sem compatibilidade calculada, diz isso em vez de deixar vazio', async () => {
    api.obterIndicadoresDeIA = vi.fn().mockResolvedValue({
      ...DADOS_IA,
      matching: { ...DADOS_IA.matching, score_medio: null },
    })
    renderizar()

    const matching = await screen.findByRole('region', { name: /matching/i })

    expect(valorDe(matching, 'Compatibilidade média das sugeridas')).toHaveTextContent(
      'ainda sem cálculo'
    )
  })

  it('mostra só as dimensões que saíram frágeis, da mais frequente para a menos', async () => {
    api.obterIndicadoresDeIA = vi.fn().mockResolvedValue({
      ...DADOS_IA,
      maturidade: {
        ...DADOS_IA.maturidade,
        frageis_por_dimensao: [
          contagem('desafio_tecnologico', 'Desafio tecnológico', 1),
          contagem('inovacao', 'Inovação', 0),
          contagem('infraestrutura', 'Infraestrutura', 3),
        ],
      },
    })
    renderizar()

    const maturidade = await screen.findByRole('region', { name: /maturidade/i })
    const linhas = within(maturidade)
      .getByText('Onde as propostas ficaram frágeis')
      .closest('.indicadores-grupo')
      .querySelectorAll('li')

    expect([...linhas].map((linha) => linha.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'Infraestrutura 3',
      'Desafio tecnológico 1',
    ])
  })

  it('sem nenhuma dimensão frágil, diz isso em uma linha', async () => {
    api.obterIndicadoresDeIA = vi.fn().mockResolvedValue({
      ...DADOS_IA,
      maturidade: {
        ...DADOS_IA.maturidade,
        frageis_por_dimensao: [contagem('inovacao', 'Inovação', 0)],
      },
    })
    renderizar()

    const maturidade = await screen.findByRole('region', { name: /maturidade/i })

    expect(within(maturidade).getByText('Nenhuma dimensão saiu frágil.')).toBeInTheDocument()
    expect(within(maturidade).queryByText('Inovação')).not.toBeInTheDocument()
  })
})

describe('Indicadores de matching e maturidade (PB74, PB75)', () => {
  it('mostra a cobertura da rede sobre as competências demandadas', async () => {
    renderizar()

    const bloco = await screen.findByRole('region', { name: /matching/i })

    expect(within(bloco).getByText('75%')).toBeInTheDocument()
    expect(within(bloco).getByText(/lacuna de competência/i)).toBeVisible()
  })

  it('separa o que a IA sugeriu do que o Supervisor incluiu', async () => {
    renderizar()

    const bloco = await screen.findByRole('region', { name: /matching/i })

    expect(within(bloco).getByText(/sugeridas pelo matching/i)).toBeVisible()
    expect(within(bloco).getByText(/incluídas pelo supervisor/i)).toBeVisible()
  })

  it('conta dimensões por nível e cita a versão dos critérios', async () => {
    renderizar()

    const bloco = await screen.findByRole('region', { name: /maturidade/i })

    expect(
      within(bloco).getByText(/critérios de referência pipe\/fapesp, versão v2/i)
    ).toBeInTheDocument()
    expect(within(bloco).getByText('Consolidada')).toBeInTheDocument()
  })

  it('mostra primeiro, e à vista, onde a proposta está frágil', async () => {
    renderizar()

    const bloco = await screen.findByRole('region', { name: /maturidade/i })
    const frageis = within(bloco).getByText('Onde as propostas ficaram frágeis')
    const porNivel = within(bloco).getByText('Como ficaram as 12 dimensões avaliadas')

    expect(within(bloco).getByText('Infraestrutura')).toBeVisible()
    expect(
      frageis.compareDocumentPosition(porNivel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('não apresenta nota, pontuação nem índice de maturidade', async () => {
    renderizar()

    const bloco = await screen.findByRole('region', { name: /maturidade/i })
    const rotulos = bloco.textContent.toLowerCase().replace(/não é nota nem parecer/, '')

    expect(rotulos).not.toMatch(/nota|parecer|pontuaç|índice|media|média/)
    expect(bloco.textContent).toMatch(/não é nota nem parecer/i)
  })

  it('o diagnóstico das rodadas fica recolhido, fora dos blocos de resultado', async () => {
    renderizar()

    const matching = await screen.findByRole('region', { name: /matching/i })

    expect(within(matching).queryByText(TERMOS.semAfinidade)).not.toBeInTheDocument()
    expect(screen.getByText(TERMOS.semAfinidade)).not.toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: /como as rodadas correram/i }))

    expect(screen.getByText(TERMOS.semAfinidade)).toBeVisible()
    expect(screen.getByText('Pré-análises sem resultado')).toBeVisible()
  })

  it('o vínculo com o vocabulário da rede é diagnóstico, não resultado', async () => {
    renderizar()

    const matching = await screen.findByRole('region', { name: /matching/i })

    expect(matching.textContent).not.toMatch(/vocabulário|cadastrada na rede/i)

    await userEvent.click(screen.getByRole('button', { name: /como as rodadas correram/i }))

    expect(valorDe(document.body, 'Ligadas a uma competência já cadastrada na rede')).toHaveTextContent(
      '2 de 4'
    )
  })

  it('a disponibilidade da rede fica junto da rede interna', async () => {
    renderizar()
    await screen.findByRole('region', { name: /matching/i })

    expect(within(bloco('rede interna')).getByText('Integral')).toBeInTheDocument()
  })

  it('declara a ausência de rodada em vez de mostrar zeros', async () => {
    api.obterIndicadoresDeIA = vi.fn().mockResolvedValue({
      matching: { houve_rodada: false },
      maturidade: { houve_execucao: false },
    })

    renderizar()

    const bloco = await screen.findByRole('region', { name: /matching/i })

    expect(within(bloco).getByText(/nenhuma rodada de matching/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /como as rodadas correram/i })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /resumo/i })).queryByText('cobertura das competências')).not.toBeInTheDocument()
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
