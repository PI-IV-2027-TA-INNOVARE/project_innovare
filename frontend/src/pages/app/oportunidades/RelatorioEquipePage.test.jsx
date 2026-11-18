import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RelatorioEquipePage from './RelatorioEquipePage'

const api = vi.hoisted(() => ({ obterRelatorioEquipe: null }))

vi.mock('../../../services/pdConnectApi', () => ({
  obterRelatorioEquipe: (...args) => api.obterRelatorioEquipe(...args),
}))

const RELATORIO = {
  oportunidade: {
    codigo: 'OP-2026-014',
    titulo: 'Detecção rápida de contaminação',
    origem: 'interna',
    origem_rotulo: 'Ideia interna',
  },
  equipe: {
    id_equipe: 3,
    data_geracao: '2026-10-15T12:00:00Z',
    execucao: {
      id_execucao: 'exec-1',
      estrategia: 'hibrido_v1',
      pesos: {
        componentes: {
          semantico: 0.45,
          lexical: 0.2,
          area: 0.25,
          disponibilidade: 0.1,
        },
      },
      usou_rerank: false,
      fallback_usado: true,
      executado_por: 'supervisor@ac2microbiologia.com.br',
      executado_por_nome: 'Rafael Antunes',
      status: 'ok',
    },
    membros: [
      {
        id_membro_equipe: 10,
        nome: 'Marina Alves',
        papel: 'pesquisador',
        papel_rotulo: 'Pesquisador',
        titulacao: 'Doutorado',
        disponibilidade: 'Integral',
        score_compatibilidade: '0.7200',
        match_reasons: ['Competência "Microbiologia de alimentos" coberta (100%).'],
        score_features: { semantico: null, lexical: 1 },
        incluido: true,
        origem: 'ia',
        origem_rotulo: 'Sugerida pelo matching',
        validada: true,
      },
      {
        id_membro_equipe: 11,
        nome: 'Bruno Dias',
        papel: 'pesquisador',
        papel_rotulo: 'Pesquisador',
        titulacao: null,
        disponibilidade: 'Parcial',
        score_compatibilidade: '0.1100',
        match_reasons: [],
        score_features: {},
        incluido: false,
        origem: 'ia',
        origem_rotulo: 'Sugerida pelo matching',
        validada: false,
      },
    ],
    lacunas: [
      {
        id_lacuna_equipe: 5,
        descricao: 'Nenhuma pessoa sugerida cobre "Estatística aplicada".',
      },
    ],
  },
  competencias: [
    {
      id_competencia_necessaria: 1,
      descricao: 'Microbiologia de alimentos',
      nivel_importancia: 'essencial',
      nivel_rotulo: 'Essencial',
      no_vocabulario: true,
    },
    {
      id_competencia_necessaria: 2,
      descricao: 'Estatística aplicada',
      nivel_importancia: 'desejavel',
      nivel_rotulo: 'Desejável',
      no_vocabulario: false,
    },
  ],
  gerado_em: '2026-10-16T09:00:00Z',
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/oportunidades/OP-2026-014/relatorio/equipe']}>
      <Routes>
        <Route
          path="/oportunidades/:id/relatorio/equipe"
          element={<RelatorioEquipePage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RelatorioEquipePage (PB77)', () => {
  beforeEach(() => {
    api.obterRelatorioEquipe = vi.fn().mockResolvedValue(RELATORIO)
  })

  /**
   * Cada pessoa ocupava de 7 a 11 linhas, com a nota chamada de "aderência"
   * enquanto o app diz "compatibilidade". Agora é uma tabela, com o mesmo
   * nome do app e a afinidade com o tema como coluna própria.
   */
  it('documenta a composição numa tabela, com a compatibilidade de cada pessoa', async () => {
    renderizar()

    const linha = (await screen.findByRole('rowheader', { name: /marina alves/i })).closest('tr')

    expect(screen.getByRole('columnheader', { name: 'Compatibilidade' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /afinidade com o tema/i })).toBeInTheDocument()
    expect(within(linha).getByRole('cell', { name: '72%' })).toBeInTheDocument()
    expect(within(linha).getByRole('cell', { name: 'Doutorado' })).toBeInTheDocument()
    expect(within(linha).getByRole('cell', { name: 'Integral' })).toBeInTheDocument()
    expect(within(linha).getByRole('cell', { name: 'indisponível' })).toBeInTheDocument()
    expect(
      screen.getByText(/Microbiologia de alimentos" coberta \(100%\)/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/aderência/i)).not.toBeInTheDocument()
  })

  it('separa supervisão de pesquisa e não repete nos motivos o que a tabela já diz', async () => {
    api.obterRelatorioEquipe = vi.fn().mockResolvedValue({
      ...RELATORIO,
      equipe: {
        ...RELATORIO.equipe,
        membros: [
          ...RELATORIO.equipe.membros,
          {
            id_membro_equipe: 12,
            nome: 'Wagner Macedo',
            papel: 'supervisor',
            papel_rotulo: 'Supervisor',
            titulacao: 'Doutorado',
            disponibilidade: 'Integral',
            score_compatibilidade: '0.3000',
            match_reasons: [
              'Competência "Processos industriais" coberta pelo perfil (80%).',
              'Titulação: Doutorado.',
              'Formação: não informada.',
              'Disponibilidade declarada: Integral.',
              'Integra a rede como Supervisor.',
              'Afinidade com o tema da oportunidade: 38%.',
            ],
            score_features: { semantico: 0.38 },
            incluido: true,
            origem: 'ia',
            origem_rotulo: 'Sugerida pelo matching',
            validada: false,
          },
        ],
      },
    })

    renderizar()

    const supervisao = await screen.findByRole('table', { name: 'Supervisão' })
    const pesquisa = screen.getByRole('table', { name: 'Pesquisa' })

    expect(within(supervisao).getByRole('rowheader', { name: /wagner macedo/i })).toBeInTheDocument()
    expect(within(pesquisa).queryByText(/wagner macedo/i)).not.toBeInTheDocument()
    expect(within(supervisao).getByRole('cell', { name: '38%' })).toBeInTheDocument()

    const motivos = within(supervisao).getByText(/Processos industriais/).closest('td')

    expect(motivos).toHaveTextContent('Formação: não informada.')
    expect(motivos).not.toHaveTextContent('Titulação: Doutorado.')
    expect(motivos).not.toHaveTextContent('Disponibilidade declarada')
    expect(motivos).not.toHaveTextContent('Integra a rede como Supervisor.')
    expect(motivos).not.toHaveTextContent('Afinidade com o tema')
  })

  /**
   * "Nenhuma pessoa cobre ..." é a informação mais importante da seção e
   * ficava no fim, depois da composição inteira.
   */
  it('as lacunas da composição vêm antes da tabela', async () => {
    renderizar()

    const lacunas = await screen.findByRole('heading', { name: 'Lacunas da composição' })
    const composicao = screen.getByRole('heading', { name: 'Composição sugerida' })

    expect(lacunas.compareDocumentPosition(composicao) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()
  })

  it('não lista quem o Supervisor tirou da composição', async () => {
    renderizar()

    await screen.findByText(/marina alves/i)

    expect(screen.queryByText(/bruno dias/i)).not.toBeInTheDocument()
  })

  /**
   * O documento mostrava o código da rodada ("hibrido_v1"), o e-mail de quem
   * rodou, o peso em fração e "no vocabulário da rede": nomes de sistema, não
   * texto de leitura.
   */
  it('não mostra código, e-mail nem jargão da rede', async () => {
    renderizar()

    expect(await screen.findByText('Rafael Antunes')).toBeInTheDocument()
    expect(screen.queryByText('hibrido_v1')).not.toBeInTheDocument()
    expect(screen.queryByText(/supervisor@ac2microbiologia/)).not.toBeInTheDocument()
    expect(screen.queryByText(/vocabulário/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/já cadastrada na rede interna/i).length).toBeGreaterThan(0)
  })

  /**
   * A afinidade com o tema aparecia duas vezes no quadro da rodada, uma com o
   * estado e outra com o peso, e "Revisão da IA: não" não dizia o que isso
   * muda.
   */
  it('leva os pesos da rodada, que são a régua da compatibilidade', async () => {
    renderizar()

    const titulo = await screen.findByRole('heading', { name: 'Rodada do matching' })
    const rodada = within(titulo.closest('section, .relatorio-subsecao'))

    expect(rodada.getByText('Quatro parcelas combinadas, versão 1')).toBeInTheDocument()
    expect(rodada.getAllByText(/afinidade com o tema/i)).toHaveLength(1)
    expect(rodada.getByText('peso 45% · indisponível nesta rodada')).toBeInTheDocument()
    expect(rodada.getByText(/não: a ordem é a do cálculo/i)).toBeInTheDocument()
  })

  it('quando o método já explica os pesos, o quadro da rodada não os repete', async () => {
    api.obterRelatorioEquipe = vi.fn().mockResolvedValue({
      ...RELATORIO,
      como_foi_calculado: ['A nota de cada pessoa soma quatro parcelas, cada uma com o seu peso.'],
    })

    renderizar()

    const titulo = await screen.findByRole('heading', { name: 'Rodada do matching' })
    const rodada = within(titulo.closest('section, .relatorio-subsecao'))

    expect(rodada.queryByText(/^peso /)).not.toBeInTheDocument()
    expect(rodada.getByText('indisponível nesta rodada')).toBeInTheDocument()
  })

  it('lista as competências comparadas e a lacuna da composição', async () => {
    renderizar()

    expect(
      await screen.findByText(/microbiologia de alimentos · essencial/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Nenhuma pessoa sugerida cobre "Estatística aplicada"/i),
    ).toBeInTheDocument()
  })

  it('diz que a composição é sugestão, não convocação', async () => {
    renderizar()

    expect(
      await screen.findByText(/não há convite, aceite nem recusa/i),
    ).toBeInTheDocument()
  })

  it('sem matching, explica em vez de imprimir folha vazia', async () => {
    api.obterRelatorioEquipe = vi
      .fn()
      .mockRejectedValue({ data: { codigo: 'equipe_inexistente' } })

    renderizar()

    expect(
      await screen.findByText(/ainda não tem equipe potencial gerada/i),
    ).toBeInTheDocument()
  })

  it('oferece impressão e volta para a oportunidade', async () => {
    renderizar()

    expect(
      await screen.findByRole('button', { name: /imprimir/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /voltar para a oportunidade/i }),
    ).toHaveAttribute('href', '/oportunidades/OP-2026-014')
  })
})

describe('RelatorioEquipePage — como foi calculado', () => {
  it('guarda a explicação da nota que saiu da tela', async () => {
    api.obterRelatorioEquipe = vi.fn().mockResolvedValue({
      ...RELATORIO,
      como_foi_calculado: ['A nota de cada pessoa soma quatro parcelas, cada uma com o seu peso.'],
    })
    renderizar()

    const secao = await screen.findByRole('region', { name: 'Como foi calculado' })

    expect(secao).toHaveTextContent('A nota de cada pessoa soma quatro parcelas')
  })
})
