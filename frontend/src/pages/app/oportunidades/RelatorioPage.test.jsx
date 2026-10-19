import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RelatorioPage from './RelatorioPage'

const api = vi.hoisted(() => ({ obterRelatorioOportunidade: null }))

vi.mock('../../../services/pdConnectApi', () => ({
  obterRelatorioOportunidade: (...args) => api.obterRelatorioOportunidade(...args),
}))

const RELATORIO = {
  oportunidade: {
    codigo: 'OP-2026-014',
    titulo: 'Bioinsumo para cana-de-açúcar',
    origem: 'externo',
    origem_rotulo: 'Problema externo',
    resumo: 'Perdas por contaminação microbiana na linha de envase.',
    contexto: 'A planta de Ribeirão Preto perde dois lotes por mês.',
    demandante_nome: 'Agroindústria Vale Verde',
    responsavel_nome: 'Rafael Antunes',
    situacao: 'aguardando_decisao',
    situacao_rotulo: 'Aguardando decisão',
    criada_em: '2026-10-01T12:00:00Z',
    atualizada_em: '2026-10-08T12:00:00Z',
  },
  anexos: [
    {
      id_anexo: 1,
      nome_original: 'laudo-microbiologico.pdf',
      mime: 'application/pdf',
      tamanho_bytes: 184320,
      enviado_por_nome: 'Rafael Antunes',
      criado_em: '2026-10-02T12:00:00Z',
    },
  ],
  historico: [
    {
      tipo: 'oportunidade_cadastrada',
      categoria: 'oportunidade',
      ator: 'demandante@valeverde.com.br',
      ocorrido_em: '2026-10-01T12:00:00Z',
      detalhe: {},
    },
  ],
  decisao: {
    tipo: 'continuar',
    tipo_rotulo: 'Continuar',
    justificativa: 'Aderente ao portfólio da AC2.',
    autor_nome: 'Rafael Antunes',
    registrada_em: '2026-10-08T12:00:00Z',
  },
  proposta: null,
  pendentes: [
    {
      secao: 'proposta_estruturada',
      motivo: 'A proposta estruturada ainda não foi iniciada para esta oportunidade.',
    },
    {
      secao: 'competencias_necessarias',
      motivo: 'As competências necessárias são derivadas da proposta estruturada, e essa etapa ainda não está disponível.',
    },
    {
      secao: 'equipe_potencial',
      motivo: 'A equipe potencial depende das competências necessárias, e essa etapa ainda não está disponível.',
    },
    {
      secao: 'pre_analise',
      motivo: 'A pré-análise de maturidade ainda não está disponível.',
    },
  ],
  gerado_em: '2026-10-13T15:30:00Z',
}

function renderRelatorio(codigo = 'OP-2026-014') {
  return render(
    <MemoryRouter initialEntries={[`/oportunidades/${codigo}/relatorio`]}>
      <Routes>
        <Route path="/oportunidades/:id/relatorio" element={<RelatorioPage />} />
      </Routes>
    </MemoryRouter>
  )
}

async function esperarRelatorio() {
  await screen.findByRole('heading', { name: /bioinsumo para cana/i })
}

beforeEach(() => {
  api.obterRelatorioOportunidade = vi.fn().mockResolvedValue(RELATORIO)
})

describe('RelatorioPage', () => {
  it('pede o relatório ao servidor, e não monta o documento na tela', async () => {
    /**
     * Consolidar e regra de negocio: qual decisao vale, o que entra na trilha,
     * que secoes faltam. Montar isso no cliente colocaria regra no lugar que o
     * AGENTS.md 1 proibe, e deixaria duas versoes do mesmo documento.
     */
    renderRelatorio()
    await esperarRelatorio()

    expect(api.obterRelatorioOportunidade).toHaveBeenCalledWith('OP-2026-014')
    expect(api.obterRelatorioOportunidade).toHaveBeenCalledTimes(1)
  })

  it('traz identificação, entrada, anexos e decisão num documento só', async () => {
    renderRelatorio()
    await esperarRelatorio()

    expect(screen.getAllByText('OP-2026-014').length).toBeGreaterThan(0)
    expect(screen.getByText('Agroindústria Vale Verde')).toBeInTheDocument()
    expect(screen.getByText(/perdas por contaminação microbiana/i)).toBeInTheDocument()
    expect(screen.getByText('laudo-microbiologico.pdf')).toBeInTheDocument()
    expect(screen.getByText(/aderente ao portfólio/i)).toBeInTheDocument()
  })

  it('diz de quando é o documento', async () => {
    renderRelatorio()
    await esperarRelatorio()

    expect(screen.getByTestId('relatorio-gerado-em')).toHaveTextContent(/13\/10\/2026/)
  })

  /**
   * O relatorio declara a secao que ainda nao tem conteudo, com o motivo que o
   * servidor mandou. Sumir com a secao faria o leitor concluir que ela nao
   * existe no produto.
   */
  it('declara as seções pendentes com o motivo que veio do servidor', async () => {
    renderRelatorio()
    await esperarRelatorio()

    const pendentes = screen.getByRole('region', { name: /ainda não disponível/i })
    const secoes = within(pendentes).getAllByRole('term').map((no) => no.textContent)

    expect(secoes).toEqual([
      'Proposta estruturada',
      'Competências necessárias',
      'Equipe potencial',
      'Pré-análise de maturidade',
    ])

    expect(
      within(pendentes).getByText(/ainda não foi iniciada para esta oportunidade/i)
    ).toBeInTheDocument()
  })

  it('mostra a proposta quando ela existe, e aí não a lista como pendente', async () => {
    api.obterRelatorioOportunidade = vi.fn().mockResolvedValue({
      ...RELATORIO,
      proposta: {
        problema_pesquisa: 'Alicyclobacillus resiste à pasteurização.',
        hipotese: null,
        objetivo_geral: 'Desenvolver protocolo de detecção rápida.',
        objetivos_especificos: ['Isolar cepas', 'Validar o método'],
        metodologia: 'Cultivo seletivo seguido de PCR em tempo real.',
        resultados_esperados: '',
        caracterizacao_inovacao: '',
        infraestrutura_recursos: '',
        versao: 2,
        revisada_por_humano: true,
      },
      pendentes: RELATORIO.pendentes.filter(
        (item) => item.secao !== 'proposta_estruturada'
      ),
    })

    renderRelatorio()
    await esperarRelatorio()

    expect(screen.getByText(/alicyclobacillus resiste à pasteurização/i))
      .toBeInTheDocument()
    expect(screen.getByText('Isolar cepas')).toBeInTheDocument()

    const pendentes = screen.getByRole('region', { name: /ainda não disponível/i })
    const secoes = within(pendentes).getAllByRole('term').map((no) => no.textContent)

    expect(secoes).not.toContain('Proposta estruturada')
  })

  it('manda o documento para a impressora sem sair da tela', async () => {
    const user = userEvent.setup()
    const imprimir = vi.fn()
    vi.stubGlobal('print', imprimir)

    renderRelatorio()
    await esperarRelatorio()

    await user.click(screen.getByRole('button', { name: /imprimir/i }))

    expect(imprimir).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('oferece a volta para a oportunidade de onde veio', async () => {
    renderRelatorio()
    await esperarRelatorio()

    expect(screen.getByRole('link', { name: /voltar para a oportunidade/i }))
      .toHaveAttribute('href', '/oportunidades/OP-2026-014')
  })

  it('quando a API recusa, diz o motivo e não finge um documento vazio', async () => {
    api.obterRelatorioOportunidade = vi
      .fn()
      .mockRejectedValue(new Error('Oportunidade não encontrada.'))

    renderRelatorio()

    expect(await screen.findByRole('alert')).toHaveTextContent(/não encontrada/i)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /imprimir/i })).not.toBeInTheDocument()
    )
  })

  it('sem anexo, diz que não houve documento em vez de omitir a seção', async () => {
    api.obterRelatorioOportunidade = vi
      .fn()
      .mockResolvedValue({ ...RELATORIO, anexos: [] })

    renderRelatorio()
    await esperarRelatorio()

    const anexos = screen.getByRole('region', { name: /anexos/i })
    expect(within(anexos).getByText(/nenhum documento anexado/i)).toBeInTheDocument()
  })

  it('sem decisão registrada, diz que o desfecho não foi registrado', async () => {
    api.obterRelatorioOportunidade = vi
      .fn()
      .mockResolvedValue({ ...RELATORIO, decisao: null })

    renderRelatorio()
    await esperarRelatorio()

    const decisao = screen.getByRole('region', { name: /decisão/i })
    expect(within(decisao).getByText(/ainda não foi registrada/i)).toBeInTheDocument()
  })
})
