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

  /**
   * O problema externo chega sem responsável, e o relatório mostrava só "—",
   * que se lê como dado faltando por erro. Na tela de Contexto já se diz
   * "Não definido"; o documento fala igual.
   */
  it('sem responsável, diz que ainda não foi definido', async () => {
    api.obterRelatorioOportunidade = vi.fn().mockResolvedValue({
      ...RELATORIO,
      oportunidade: { ...RELATORIO.oportunidade, responsavel_nome: null },
    })

    renderRelatorio()
    await esperarRelatorio()

    const entrada = within(screen.getByRole('region', { name: 'Entrada' }))

    expect(entrada.getByText('Responsável').nextElementSibling).toHaveTextContent('Não definido')
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

  /**
   * O histórico mostrava o código do evento (`competencia_adicionada`) e o
   * marcador interno `__sistema__`: quem lê o documento não sabia o que cada
   * linha queria dizer. PB76 pede documento apto para consulta.
   */
  it('o histórico conta o que aconteceu em texto de gente, do mais antigo ao mais novo', async () => {
    api.obterRelatorioOportunidade = vi.fn().mockResolvedValue({
      ...RELATORIO,
      historico: [
        {
          tipo: 'competencia_adicionada',
          tipo_rotulo: 'Competência adicionada',
          categoria: 'competencias',
          ator: 'supervisor@ac2microbiologia.com.br',
          ator_nome: 'Rafael Antunes',
          ocorrido_em: '2026-10-03T12:00:00Z',
          detalhe: { descricao: 'Microbiologia de alimentos' },
        },
        {
          tipo: 'situacao_atualizada',
          tipo_rotulo: 'Situação da oportunidade atualizada',
          categoria: 'oportunidade',
          ator: '__sistema__',
          ator_nome: 'Sistema',
          ocorrido_em: '2026-10-02T12:00:00Z',
          detalhe: { de: 'entrada', para: 'estruturacao', conferencia: true },
        },
        ...RELATORIO.historico,
      ],
    })

    renderRelatorio()
    await esperarRelatorio()

    const trilha = within(screen.getByRole('region', { name: /histórico/i }))
    const linhas = trilha.getAllByRole('listitem').map((linha) => linha.textContent)

    expect(linhas[0]).toMatch(/oportunidade cadastrada\./i)
    expect(linhas[1]).toMatch(/situação: em estruturação\..*sistema/i)
    expect(linhas[2]).toMatch(/competência adicionada\..*rafael antunes/i)
    expect(trilha.queryByText(/competencia_adicionada|__sistema__/)).not.toBeInTheDocument()
  })

  it('diz quem revisou a proposta, pelo nome', async () => {
    api.obterRelatorioOportunidade = vi.fn().mockResolvedValue({
      ...RELATORIO,
      proposta: {
        problema_pesquisa: 'Alicyclobacillus resiste à pasteurização.',
        objetivos_especificos: [],
        versao: 3,
        revisada_por_humano: true,
        revisor_nome: 'Rafael Antunes',
      },
    })

    renderRelatorio()
    await esperarRelatorio()

    expect(screen.getByText('Revisada por Rafael Antunes — versão 3.')).toBeInTheDocument()
  })

  /**
   * PB76 pede a visão consolidada, "apta para consulta ou apresentação". A
   * página não mostrava competências, equipe nem pré-análise, e o resumo que
   * veio depois mandava abrir outros dois relatórios, sem caminho de volta. O
   * documento agora traz tudo: o que sai na impressão é o que a tela mostra.
   */
  it('traz competências, equipe e pré-análise inteiras, sem mandar abrir outro relatório (PB76)', async () => {
    api.obterRelatorioOportunidade = vi.fn().mockResolvedValue({
      ...RELATORIO,
      competencias: [
        {
          id_competencia_necessaria: 1,
          descricao: 'Microbiologia de alimentos',
          nivel_rotulo: 'Essencial',
          derivada_rotulo: 'Derivada pelo Copiloto',
        },
      ],
      equipe: {
        execucao: {
          estrategia: 'hibrido_v1',
          pesos: { componentes: { lexical: 0.2 } },
          usou_rerank: false,
          fallback_usado: false,
          executado_por: 'supervisor@ac2microbiologia.com.br',
          executado_por_nome: 'Rafael Antunes',
        },
        membros: [
          {
            id_membro_equipe: 10,
            nome: 'Marina Alves',
            papel_rotulo: 'Pesquisador',
            titulacao: 'Doutorado',
            disponibilidade: 'Integral',
            origem_rotulo: 'Sugerida pelo matching',
            score_compatibilidade: '0.7200',
            match_reasons: ['Competência em comum: Microbiologia de alimentos.'],
            incluido: true,
            validada: true,
          },
          {
            id_membro_equipe: 11,
            nome: 'Pessoa tirada da equipe',
            papel_rotulo: 'Pesquisador',
            score_compatibilidade: '0.4000',
            incluido: false,
            validada: false,
          },
        ],
        lacunas: [{ id_lacuna_equipe: 5, descricao: 'Estatística aplicada sem cobertura.' }],
      },
      pre_analise: {
        status: 'ok',
        sintese: 'Proposta consistente, com lacuna de infraestrutura.',
        executada_por: 'supervisor@ac2microbiologia.com.br',
        executada_por_nome: 'Rafael Antunes',
        dimensoes: [
          {
            id_dimensao: 1,
            dimensao: 'desafio_tecnologico',
            dimensao_rotulo: 'Desafio tecnologico',
            nivel_rotulo: 'Consolidada',
            avaliacao: 'O desafio está descrito e é verificável.',
          },
        ],
        lacunas: [{ id_lacuna: 4, campo_afetado: 'infraestrutura', descricao: 'Não há descrição do laboratório.' }],
        recomendacoes: [
          { id_recomendacao: 2, id_lacuna: 4, texto: 'Descrever o laboratório.', acatada: true },
        ],
        versao_criterios: 'V2',
        versao_proposta: 3,
        aviso: 'Análise orientativa do P&D Connect.',
      },
      como_foi_calculado: ['A nota de cada pessoa soma quatro parcelas.'],
      como_ler: ['Cada dimensão recebe um de três níveis.'],
      criterios: [
        {
          id_criterio: 10,
          dimensao: 'plano_pesquisa',
          dimensao_rotulo: 'Plano de pesquisa',
          codigo: 'A3',
          descricao: 'Metodologia adequada — a metodologia é adequada aos objetivos?',
        },
      ],
      pendentes: [],
    })

    renderRelatorio()
    await esperarRelatorio()

    const competencias = within(screen.getByRole('region', { name: 'Competências necessárias' }))
    expect(
      competencias.getByText(/microbiologia de alimentos · essencial · derivada pelo copiloto/i),
    ).toBeInTheDocument()

    const equipe = within(screen.getByRole('region', { name: 'Equipe potencial' }))
    expect(equipe.getByText('A nota de cada pessoa soma quatro parcelas.')).toBeInTheDocument()
    expect(equipe.getByText('Quatro parcelas combinadas, versão 1')).toBeInTheDocument()
    expect(equipe.getByRole('rowheader', { name: /marina alves/i })).toBeInTheDocument()
    expect(equipe.getByRole('columnheader', { name: 'Compatibilidade' })).toBeInTheDocument()
    expect(equipe.getByRole('cell', { name: '72%' })).toBeInTheDocument()
    expect(equipe.queryByText(/aderência/i)).not.toBeInTheDocument()
    expect(equipe.getByText('Competência em comum: Microbiologia de alimentos.')).toBeInTheDocument()
    expect(equipe.getByText('Estatística aplicada sem cobertura.')).toBeInTheDocument()
    expect(equipe.queryByText(/pessoa tirada da equipe/i)).not.toBeInTheDocument()
    expect(equipe.getByText(/não é convocação/i)).toBeInTheDocument()

    const preAnalise = within(screen.getByRole('region', { name: 'Pré-análise de maturidade' }))
    expect(preAnalise.getByText(/análise orientativa/i)).toBeInTheDocument()
    expect(preAnalise.getByText('Cada dimensão recebe um de três níveis.')).toBeInTheDocument()
    expect(preAnalise.getByText('Desafio tecnológico', { selector: 'dt' })).toBeInTheDocument()
    expect(preAnalise.getByText('Consolidada')).toBeInTheDocument()
    expect(preAnalise.getByText('O desafio está descrito e é verificável.')).toBeInTheDocument()
    expect(preAnalise.getByText('Não há descrição do laboratório.')).toBeInTheDocument()
    expect(preAnalise.getByText('Descrever o laboratório.').closest('li')).toHaveTextContent('Acatada')
    expect(preAnalise.getByText('Metodologia adequada')).toBeInTheDocument()

    expect(screen.queryByRole('link', { name: /relatório da equipe|relatório da pré-análise/i }))
      .not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /ainda não disponível/i })).not.toBeInTheDocument()
  })

  /**
   * O documento começava na Entrada, e entender a situação pedia rolar cerca
   * de dez telas. A visão geral junta o estado de cada etapa no topo.
   */
  it('abre com uma visão geral da oportunidade', async () => {
    api.obterRelatorioOportunidade = vi.fn().mockResolvedValue({
      ...RELATORIO,
      oportunidade: { ...RELATORIO.oportunidade, responsavel_nome: null },
      decisao: null,
      proposta: { versao: 3, revisada_por_humano: true, revisor_nome: 'Rafael Antunes' },
      competencias: [
        { id_competencia_necessaria: 1, descricao: 'A', nivel_importancia: 'essencial' },
        { id_competencia_necessaria: 2, descricao: 'B', nivel_importancia: 'desejavel' },
      ],
      equipe: {
        execucao: null,
        membros: [
          { id_membro_equipe: 1, nome: 'Ana', incluido: true, validada: true },
          { id_membro_equipe: 2, nome: 'Bia', incluido: true, validada: true },
          { id_membro_equipe: 3, nome: 'Fora', incluido: false, validada: false },
        ],
        lacunas: [{ id_lacuna_equipe: 1, descricao: 'X sem cobertura.' }],
      },
      pre_analise: {
        status: 'ok',
        sintese: 'Proposta promissora.\n- Validar o ineditismo',
        dimensoes: [
          { id_dimensao: 1, dimensao: 'viabilidade', nivel: 'fragil', nivel_rotulo: 'Frágil' },
          { id_dimensao: 2, dimensao: 'plano_pesquisa', nivel: 'consolidada', nivel_rotulo: 'Consolidada' },
          { id_dimensao: 3, dimensao: 'equipe', nivel: 'em_desenvolvimento', nivel_rotulo: 'Em desenvolvimento' },
        ],
        lacunas: [],
        recomendacoes: [
          { id_recomendacao: 1, texto: 'R1', acatada: true },
          { id_recomendacao: 2, texto: 'R2', acatada: false },
        ],
        aviso: 'Análise orientativa.',
      },
      pendentes: [],
    })

    renderRelatorio()
    await esperarRelatorio()

    const geral = screen.getByRole('region', { name: 'Visão geral' })
    const linha = (rotulo) => within(geral).getByText(rotulo, { selector: 'dt' }).nextElementSibling

    expect(within(geral).getByText(/documento parcial: a decisão ainda não foi registrada/i))
      .toBeInTheDocument()
    expect(linha('Decisão')).toHaveTextContent('Pendente')
    expect(linha('Responsável')).toHaveTextContent('Não definido')
    expect(linha('Proposta')).toHaveTextContent('Revisada por Rafael Antunes, versão 3')
    expect(linha('Competências')).toHaveTextContent('2 competências, 1 essencial')
    expect(linha('Equipe potencial')).toHaveTextContent('2 pessoas · 1 lacuna de competência · validada')
    expect(linha('Maturidade')).toHaveTextContent('1 frágil')
    expect(linha('Maturidade')).toHaveTextContent('1 em desenvolvimento')
    expect(linha('Maturidade')).toHaveTextContent('1 consolidada')
    expect(linha('Recomendações')).toHaveTextContent('1 de 2 acatadas')
    expect(within(geral).getByText('Proposta promissora.')).toBeInTheDocument()
    expect(within(geral).getByRole('listitem')).toHaveTextContent('Validar o ineditismo')

    const sumario = screen.getByRole('navigation', { name: 'Sumário do relatório' })
    expect(within(sumario).getAllByRole('link')[0]).toHaveTextContent('Visão geral')

    const preAnalise = screen.getByRole('region', { name: 'Pré-análise de maturidade' })
    expect(within(preAnalise).queryByText('Proposta promissora.')).not.toBeInTheDocument()
    expect(
      within(preAnalise).getAllByText(/^(Frágil|Em desenvolvimento|Consolidada)$/).map((selo) => selo.textContent),
    ).toEqual(['Frágil', 'Em desenvolvimento', 'Consolidada'])
  })

  it('com a decisão registrada, a visão geral não fala em documento parcial', async () => {
    renderRelatorio()
    await esperarRelatorio()

    const geral = screen.getByRole('region', { name: 'Visão geral' })

    expect(within(geral).queryByText(/documento parcial/i)).not.toBeInTheDocument()
    expect(within(geral).getByText('Decisão', { selector: 'dt' }).nextElementSibling)
      .not.toHaveTextContent('Pendente')
  })

  it('o sumário lista só as seções do documento, sem as partes de dentro', async () => {
    api.obterRelatorioOportunidade = vi.fn().mockResolvedValue({
      ...RELATORIO,
      equipe: { execucao: null, membros: [], lacunas: [] },
      como_foi_calculado: ['A nota de cada pessoa soma quatro parcelas.'],
      pendentes: [],
    })

    renderRelatorio()
    await esperarRelatorio()

    const sumario = screen.getByRole('navigation', { name: 'Sumário do relatório' })
    const itens = within(sumario).getAllByRole('link').map((link) => link.textContent)

    expect(itens).toContain('Equipe potencial')
    expect(itens).not.toContain('Como foi calculado')
    expect(itens).not.toContain('Composição sugerida')
  })
})
