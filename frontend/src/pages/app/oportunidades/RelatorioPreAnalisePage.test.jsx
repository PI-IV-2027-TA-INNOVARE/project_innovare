import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RelatorioPreAnalisePage from './RelatorioPreAnalisePage'

const api = vi.hoisted(() => ({ obterRelatorioPreAnalise: null }))

vi.mock('../../../services/pdConnectApi', () => ({
  obterRelatorioPreAnalise: (...args) => api.obterRelatorioPreAnalise(...args),
}))

const AVISO =
  'Análise orientativa do P&D Connect. Não é nota, parecer, aprovação, submissão nem decisão da FAPESP.'

const RELATORIO = {
  oportunidade: {
    codigo: 'OP-2026-014',
    titulo: 'Detecção rápida de contaminação',
    origem: 'interna',
    origem_rotulo: 'Ideia interna',
  },
  proposta: {
    problema_pesquisa: 'Contaminação resiste à pasteurização.',
    objetivo_geral: 'Desenvolver protocolo de detecção rápida.',
    metodologia: 'Cultivo seletivo e PCR em tempo real.',
    caracterizacao_inovacao: 'De 10 dias para 48 horas.',
    infraestrutura_recursos: 'Laboratório da AC2.',
  },
  pre_analise: {
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
    lacunas: [{ id_lacuna: 4, descricao: 'Não há descrição do laboratório.' }],
    recomendacoes: [
      {
        id_recomendacao: 2,
        texto: 'Descrever a infraestrutura disponível.',
        acatada: false,
      },
    ],
  },
  criterios: [
    {
      id_criterio: 10,
      versao: 'V2',
      dimensao: 'plano_pesquisa',
      dimensao_rotulo: 'Plano de pesquisa',
      codigo: 'A3',
      descricao: 'Metodologia adequada — a metodologia é adequada aos objetivos?',
    },
  ],
  equipe: {
    id_equipe: 3,
    membros: [
      {
        id_membro_equipe: 10,
        nome: 'Marina Alves',
        papel_rotulo: 'Pesquisador',
        titulacao: 'Doutorado',
        disponibilidade: 'Integral',
        incluido: true,
      },
    ],
  },
  gerado_em: '2026-10-15T13:00:00Z',
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/oportunidades/OP-2026-014/relatorio/pre-analise']}>
      <Routes>
        <Route
          path="/oportunidades/:id/relatorio/pre-analise"
          element={<RelatorioPreAnalisePage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RelatorioPreAnalisePage (PB78)', () => {
  beforeEach(() => {
    api.obterRelatorioPreAnalise = vi.fn().mockResolvedValue(RELATORIO)
  })

  it('consolida resultado por dimensão, lacunas e recomendações', async () => {
    renderizar()

    expect(
      await screen.findByRole('heading', { name: /detecção rápida de contaminação/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/desafio tecnologico · consolidada/i)).toBeInTheDocument()
    expect(screen.getByText('Não há descrição do laboratório.')).toBeInTheDocument()
    expect(
      screen.getByText('Descrever a infraestrutura disponível.'),
    ).toBeInTheDocument()
  })

  it('põe cada recomendação sob a lacuna, com o critério ou a falta de evidência', async () => {
    api.obterRelatorioPreAnalise = vi.fn().mockResolvedValue({
      ...RELATORIO,
      pre_analise: {
        ...RELATORIO.pre_analise,
        lacunas: [
          {
            id_lacuna: 4,
            campo_afetado: 'plano_pesquisa',
            descricao: 'Falta o controle negativo.',
            criterio_codigo: 'A3',
            criterio_rotulo: 'Metodologia adequada',
          },
          { id_lacuna: 5, campo_afetado: 'viabilidade', descricao: 'Não há prazo.' },
        ],
        recomendacoes: [
          { id_recomendacao: 2, id_lacuna: 4, texto: 'Defina o controle negativo.', acatada: true },
          { id_recomendacao: 3, id_lacuna: 5, texto: 'Monte um cronograma.', acatada: false },
          { id_recomendacao: 6, id_lacuna: null, texto: 'Revise o resumo.', acatada: false },
        ],
      },
    })

    renderizar()

    const ligada = (await screen.findByText('Falta o controle negativo.')).closest('li')
    expect(ligada).toHaveTextContent('Plano de pesquisa · A3 · Metodologia adequada')
    expect(within(ligada).getByText(/Defina o controle negativo\./)).toHaveTextContent('(acatada)')

    const semCriterio = screen.getByText('Não há prazo.').closest('li')
    expect(semCriterio).toHaveTextContent('Sem evidência na proposta')
    expect(within(semCriterio).getByText('Monte um cronograma.')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Outras recomendações' })).toBeInTheDocument()
  })

  it('carrega o aviso de que o documento é orientativo', async () => {
    renderizar()

    expect(await screen.findByText(AVISO)).toBeInTheDocument()
  })

  it('cita a versão dos critérios e lista os critérios dessa versão', async () => {
    renderizar()

    expect(await screen.findByText('Critérios V2')).toBeInTheDocument()
    expect(screen.getByText(/metodologia adequada/i)).toBeInTheDocument()
  })

  it('mostra a equipe considerada e a proposta avaliada', async () => {
    renderizar()

    expect(await screen.findByText(/marina alves/i)).toBeInTheDocument()
    expect(
      screen.getByText('Desenvolver protocolo de detecção rápida.'),
    ).toBeInTheDocument()
  })

  it('sem pré-análise, explica em vez de imprimir folha vazia', async () => {
    api.obterRelatorioPreAnalise = vi
      .fn()
      .mockRejectedValue({ data: { codigo: 'preanalise_inexistente' } })

    renderizar()

    expect(
      await screen.findByText(/ainda não tem pré-análise executada/i),
    ).toBeInTheDocument()
  })

  it('sem proposta estruturada, explica em vez de mostrar o erro cru', async () => {
    api.obterRelatorioPreAnalise = vi.fn().mockRejectedValue({
      message: 'detail: Esta oportunidade ainda nao tem proposta estruturada. codigo: proposta_inexistente',
      data: { codigo: 'proposta_inexistente' },
    })

    renderizar()

    expect(
      await screen.findByText(/ainda não tem proposta estruturada/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/codigo:/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('execução sem resultado vira documento que declara a falha', async () => {
    api.obterRelatorioPreAnalise = vi.fn().mockResolvedValue({
      ...RELATORIO,
      pre_analise: {
        ...RELATORIO.pre_analise,
        status: 'erro',
        status_rotulo: 'Erro',
        erro: 'provedor_indisponivel',
        dimensoes: [],
        lacunas: [],
        recomendacoes: [],
        sintese: '',
      },
    })

    renderizar()

    expect(
      await screen.findByText(/não produziu resultado/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/desafio tecnologico/i)).not.toBeInTheDocument()
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

describe('RelatorioPreAnalisePage — como ler', () => {
  it('explica como ler a pré-análise', async () => {
    api.obterRelatorioPreAnalise = vi.fn().mockResolvedValue({
      ...RELATORIO,
      como_ler: ['Cada dimensão recebe um de três níveis.'],
    })
    renderizar()

    const secao = await screen.findByRole('region', { name: 'Como ler esta pré-análise' })

    expect(secao).toHaveTextContent('Cada dimensão recebe um de três níveis.')
  })
})
