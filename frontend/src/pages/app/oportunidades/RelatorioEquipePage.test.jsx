import { render, screen } from '@testing-library/react'
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

  it('documenta a composição com a aderência de cada pessoa', async () => {
    renderizar()

    expect(
      await screen.findByText(/marina alves · pesquisador · aderência 72%/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Microbiologia de alimentos" coberta \(100%\)/i),
    ).toBeInTheDocument()
  })

  it('não lista quem o Supervisor tirou da composição', async () => {
    renderizar()

    await screen.findByText(/marina alves/i)

    expect(screen.queryByText(/bruno dias/i)).not.toBeInTheDocument()
  })

  it('leva os pesos da rodada, que são a régua da aderência', async () => {
    renderizar()

    expect(await screen.findByText('hibrido_v1')).toBeInTheDocument()
    expect(screen.getByText(/indisponível na rodada/i)).toBeInTheDocument()
    expect(screen.getByText('peso 0.45')).toBeInTheDocument()
    expect(screen.getAllByText(/afinidade com o tema/i).length).toBe(2)
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
