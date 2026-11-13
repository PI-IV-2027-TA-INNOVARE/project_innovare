import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OportunidadePage from './OportunidadePage'
import OportunidadesPage from './OportunidadesPage'
import {
  NUCLEO_INTERNO,
  OPORTUNIDADES_EXEMPLO,
  daApi,
  emAndamento,
  resumoPorSituacao,
} from './oportunidadesData'

const auth = { user: null, isAuthenticated: true }

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

const api = vi.hoisted(() => ({
  listOportunidades: null,
  obterOportunidade: null,
  listarHistorico: null,
  registrarDecisao: null,
  obterEstadoCopiloto: null,
  listarCompetencias: null,
  obterEquipePotencial: null,
  obterPreAnalise: null,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  listOportunidades: (...args) => api.listOportunidades(...args),
  obterOportunidade: (...args) => api.obterOportunidade(...args),
  listarHistorico: (...args) => api.listarHistorico(...args),
  registrarDecisao: (...args) => api.registrarDecisao(...args),
  obterEstadoCopiloto: (...args) => api.obterEstadoCopiloto(...args),
  listarCompetencias: (...args) => api.listarCompetencias(...args),
  obterEquipePotencial: (...args) => api.obterEquipePotencial(...args),
  obterPreAnalise: (...args) => api.obterPreAnalise(...args),
  iniciarSessaoCopiloto: vi.fn(),
  responderCopiloto: vi.fn(),
  estruturarComCopiloto: vi.fn(),
  concluirSessaoCopiloto: vi.fn(),
  derivarCompetencias: vi.fn(),
  adicionarCompetencia: vi.fn(),
  atualizarCompetencia: vi.fn(),
  removerCompetencia: vi.fn(),
  executarMatching: vi.fn(),
  ajustarMembroEquipe: vi.fn(),
  adicionarMembroEquipe: vi.fn(),
  validarEquipe: vi.fn(),
  executarPreAnalise: vi.fn(),
  acatarRecomendacao: vi.fn(),
  listarRede: vi.fn(() => Promise.resolve({ results: [] })),
}))

function comoApi(oportunidade) {
  return {
    codigo: oportunidade.id,
    titulo: oportunidade.titulo,
    origem: oportunidade.origem,
    resumo: oportunidade.resumo,
    contexto: oportunidade.contexto || '',
    demandante_nome:
      oportunidade.origem === 'externo' ? oportunidade.demandante : null,
    responsavel_nome: oportunidade.responsavel,
    situacao: oportunidade.situacao,
    total_anexos: 0,
    ultima_decisao: null,
    criada_em: new Date(oportunidade.criadaEm).toISOString(),
    atualizada_em: new Date(oportunidade.atualizadaEm).toISOString(),
    aguarda_minha_atuacao: Boolean(oportunidade.aguardaMinhaAtuacao),
    resumo_da_equipe: {
      estado: oportunidade.equipe.length > 0 ? 'com_equipe' : 'nao_executado',
      membros: oportunidade.equipe.length,
      lacunas: oportunidade.lacunas.length,
    },
  }
}

function comResumoDaEquipe(codigo, titulo, resumo) {
  return { ...comoApi(OPORTUNIDADES_EXEMPLO[0]), codigo, titulo, resumo_da_equipe: resumo }
}

const FILA_COM_EQUIPES = [
  comResumoDaEquipe('OP-2026-101', 'Sem competências', { estado: 'aguardando_competencias', membros: 0, lacunas: 0 }),
  comResumoDaEquipe('OP-2026-102', 'Sem rodada', { estado: 'nao_executado', membros: 0, lacunas: 0 }),
  comResumoDaEquipe('OP-2026-103', 'Rodada vazia', { estado: 'sem_resultado', membros: 0, lacunas: 2 }),
  comResumoDaEquipe('OP-2026-104', 'Com equipe', { estado: 'com_equipe', membros: 2, lacunas: 1 }),
  comResumoDaEquipe('OP-2026-105', 'Uma pessoa', { estado: 'com_equipe', membros: 1, lacunas: 2 }),
  comResumoDaEquipe('OP-2026-106', 'Equipe completa', { estado: 'com_equipe', membros: 3, lacunas: 0 }),
]

const TRILHA = [
  {
    ocorrido_em: '2026-08-20T10:00:00.000Z',
    categoria: 'oportunidade',
    tipo: 'oportunidade_cadastrada',
    ator: 'Agroindústria Vale Verde',
    status: 'sucesso',
    detalhe: {},
  },
  {
    ocorrido_em: '2026-08-22T10:00:00.000Z',
    categoria: 'matching',
    tipo: 'matching_executado',
    ator: '__sistema__',
    status: 'sucesso',
    detalhe: {},
  },
]

function porCodigo(codigo) {
  return OPORTUNIDADES_EXEMPLO.find((item) => item.id === codigo)
}

function servidorResponde(oportunidades) {
  api.listOportunidades.mockResolvedValue({ results: oportunidades.map(comoApi) })
}

function servidorDetalha(codigo, extras = {}) {
  api.obterOportunidade.mockResolvedValue({ ...comoApi(porCodigo(codigo)), ...extras })
}

function entrarComo(role, displayName) {
  auth.user = { role, displayName, email: `${role}@ac2microbiologia.com.br` }
}

function renderApp(rota = '/oportunidades') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/oportunidades" element={<OportunidadesPage />} />
        <Route path="/oportunidades/:id" element={<OportunidadePage />} />
      </Routes>
    </MemoryRouter>
  )
}

async function esperarLista() {
  await screen.findByText('Bioinsumo para cana-de-açúcar', {}, { timeout: 2000 })
}

beforeEach(() => {
  api.listOportunidades = vi.fn()
  api.obterOportunidade = vi.fn()
  api.listarHistorico = vi.fn().mockResolvedValue([])
  api.registrarDecisao = vi.fn().mockResolvedValue({})
  api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
    sessao: null,
    mensagens: [],
    perguntas: [],
    lacunas: [],
    elementos_vazios: [],
    proposta_iniciada: false,
    base_disponivel: false,
    baseline_id: '?',
  })
  api.listarCompetencias = vi.fn().mockResolvedValue([])
  api.obterEquipePotencial = vi
    .fn()
    .mockRejectedValue({ data: { codigo: 'equipe_inexistente' } })
  api.obterPreAnalise = vi
    .fn()
    .mockRejectedValue({ data: { codigo: 'preanalise_inexistente' } })

  servidorResponde(OPORTUNIDADES_EXEMPLO)
  servidorDetalha('OP-2026-014')
  entrarComo('supervisor', 'Rafael Antunes')
})

const abaDaNavegacao = (nome) =>
  within(screen.getByRole('navigation', { name: /etapas da oportunidade/i })).getByRole(
    'button',
    { name: nome },
  )

describe('OportunidadesPage', () => {
  /**
   * A fila so era buscada ao montar a tela. Quem ficasse com a aba aberta via
   * o estado do momento em que entrou: oportunidade nova, decisao de outro
   * Supervisor, mudanca de situacao - nada disso aparecia ate trocar de rota
   * ou recarregar a pagina.
   *
   * Voltar para a aba e o sinal mais barato de "estou olhando de novo", e e
   * onde a fila desatualizada atrapalha de fato.
   */
  it('busca a fila de novo quando o usuário volta para a aba', async () => {
    renderApp()
    await esperarLista()

    expect(api.listOportunidades).toHaveBeenCalledTimes(1)

    servidorResponde([
      ...OPORTUNIDADES_EXEMPLO,
      {
        ...OPORTUNIDADES_EXEMPLO[0],
        id: 'OP-2026-099',
        titulo: 'Conservante natural para pães',
      },
    ])

    window.dispatchEvent(new Event('focus'))

    expect(await screen.findByText('Conservante natural para pães')).toBeInTheDocument()
    expect(api.listOportunidades).toHaveBeenCalledTimes(2)
  })

  it('não busca a fila de quem não a acompanha, nem ao voltar para a aba', async () => {
    entrarComo('demandante', 'Agroindústria Vale Verde')
    renderApp()

    await waitFor(() => expect(api.listOportunidades).not.toHaveBeenCalled())

    window.dispatchEvent(new Event('focus'))

    expect(api.listOportunidades).not.toHaveBeenCalled()
  })

  it('mostra a fila inteira e os indicadores ao Supervisor', async () => {
    renderApp()
    await esperarLista()

    expect(api.listOportunidades).toHaveBeenCalledTimes(1)

    expect(screen.getByRole('heading', { name: 'Oportunidades', level: 1 })).toBeInTheDocument()

    const decisao = screen.getByText('Aguardando decisão', { selector: '.stat-card__label' }).closest('.stat-card')
    expect(within(decisao).getByText('1')).toBeInTheDocument()

    expect(screen.getByText('Cultura starter para queijo artesanal')).toBeInTheDocument()
  })

  it('a ideia interna aparece sob o Núcleo, e não sob uma organização demandante', async () => {
    renderApp()
    await esperarLista()

    const interna = screen
      .getByText('Cultura starter para queijo artesanal')
      .closest('.oportunidade-link')

    expect(within(interna).getByText(`OP-2026-011 · ${NUCLEO_INTERNO}`)).toBeInTheDocument()
  })

  it('o recorte do Pesquisador vem do servidor, não de filtro na tela', async () => {
    entrarComo('pesquisador', 'Maria Ferreira')
    servidorResponde(OPORTUNIDADES_EXEMPLO.filter((item) => item.equipePara.includes('Maria Ferreira')))

    renderApp()
    await esperarLista()

    expect(screen.getByRole('heading', { name: 'Minhas oportunidades', level: 1 })).toBeInTheDocument()

    expect(screen.getByText('Controle de Listeria em linha de laticínios')).toBeInTheDocument()
    expect(screen.queryByText('Cultura starter para queijo artesanal')).not.toBeInTheDocument()

    expect(screen.queryByText('Aguardando decisão', { selector: '.stat-card__label' })).not.toBeInTheDocument()
  })

  it('não entrega a lista de outro papel a quem não é Supervisor nem Pesquisador', async () => {
    entrarComo('administrador', 'Administração da plataforma')
    renderApp()

    expect(await screen.findByText(/não acompanha oportunidades por esta tela/i))
      .toBeInTheDocument()
    expect(screen.queryByText('Bioinsumo para cana-de-açúcar')).not.toBeInTheDocument()
    expect(api.listOportunidades).not.toHaveBeenCalled()
  })

  it('quando a API falha, diz o motivo e oferece tentar de novo', async () => {
    const user = userEvent.setup()
    api.listOportunidades.mockRejectedValueOnce(new Error('Sessão expirada.'))

    renderApp()

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('Sessão expirada.')
    expect(screen.queryByText('Bioinsumo para cana-de-açúcar')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /tentar de novo/i }))

    await esperarLista()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('fila vazia no servidor mostra o estado vazio, não um erro', async () => {
    servidorResponde([])

    renderApp()

    expect(await screen.findByText(/cadastre uma ideia interna/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ordena a situação pela etapa do fluxo, não pelo alfabeto', async () => {
    const user = userEvent.setup()
    renderApp()
    await esperarLista()

    await user.click(screen.getByRole('button', { name: /ordenar por situação/i }))

    const primeiro = document.querySelectorAll('.oportunidade-link__titulo')[0].textContent
    expect(primeiro).toBe('Cultura starter para queijo artesanal')
  })

  /**
   * PB61: a fila indica status e prioridade. A prioridade vem da API e a
   * fila abre ordenada por ela, Alta primeiro; o filtro recorta por valor.
   */
  it('abre ordenada pela prioridade e filtra por ela', async () => {
    const user = userEvent.setup()
    const [primeira, segunda, ...resto] = OPORTUNIDADES_EXEMPLO
    api.listOportunidades.mockResolvedValue({
      results: [
        { ...comoApi(primeira), prioridade: 'baixa' },
        { ...comoApi(segunda), prioridade: 'alta' },
        ...resto.map((item) => ({ ...comoApi(item), prioridade: 'media' })),
      ],
    })
    renderApp()
    await esperarLista()

    const titulos = () =>
      [...document.querySelectorAll('.oportunidade-link__titulo')].map((item) => item.textContent)
    expect(titulos()[0]).toBe(segunda.titulo)
    expect(titulos().at(-1)).toBe(primeira.titulo)

    await user.selectOptions(screen.getByLabelText('Prioridade'), 'alta')

    expect(titulos()).toEqual([segunda.titulo])
  })

  it('abre recortada no que está em andamento quando vem do indicador do painel', async () => {
    renderApp('/oportunidades?situacao=em_andamento')
    await esperarLista()

    const titulos = [...document.querySelectorAll('.oportunidade-link__titulo')]
      .map((item) => item.textContent)
    const emCurso = OPORTUNIDADES_EXEMPLO.filter(emAndamento).map((item) => item.titulo)

    expect(titulos).toHaveLength(emCurso.length)
    expect(titulos).toEqual(expect.arrayContaining(emCurso))
    expect(screen.getByLabelText('Situação')).toHaveValue('em_andamento')
  })

  /**
   * A lista não trazia nada da equipe, e toda linha dizia "Ainda sem
   * matching" - até as que estavam em Pré-análise ou já decididas.
   */
  it('a coluna Equipe potencial mostra o estado real do matching', async () => {
    api.listOportunidades.mockResolvedValue({ results: FILA_COM_EQUIPES })
    renderApp()

    const equipeDe = async (titulo) =>
      (await screen.findByText(titulo)).closest('tr').querySelector('[data-label="Equipe potencial"]')

    expect(await equipeDe('Sem competências')).toHaveTextContent('Aguardando competências')
    expect(await equipeDe('Sem rodada')).toHaveTextContent('Matching não executado')
    expect(await equipeDe('Rodada vazia')).toHaveTextContent('Nenhum perfil encontrado')
    expect(await equipeDe('Com equipe')).toHaveTextContent('2 pessoas')
    expect(await equipeDe('Uma pessoa')).toHaveTextContent('1 pessoa')
    expect(screen.queryByText('Ainda sem matching')).not.toBeInTheDocument()
  })

  /**
   * "3 lacunas" solto na célula não dizia nada a quem não conhece o termo. A
   * contagem fica no card do topo, que explica o que conta, e o nome de cada
   * lacuna fica na aba Equipe.
   */
  it('a coluna Equipe potencial não mostra a contagem de lacunas', async () => {
    api.listOportunidades.mockResolvedValue({ results: FILA_COM_EQUIPES })
    renderApp()
    await screen.findByText('Com equipe')

    const colunas = document.querySelectorAll('[data-label="Equipe potencial"]')

    colunas.forEach((coluna) => expect(coluna).not.toHaveTextContent(/lacuna/i))
  })

  it('o card de lacuna conta as equipes que o servidor diz que têm lacuna', async () => {
    api.listOportunidades.mockResolvedValue({ results: FILA_COM_EQUIPES })
    renderApp()
    await screen.findByText('Com equipe')

    const lacuna = screen.getByText('Com lacuna de competência', { selector: '.stat-card__label' })
      .closest('.stat-card')

    expect(within(lacuna).getByText('3')).toBeInTheDocument()
  })

  it('os indicadores explicam o que contam, com as mesmas frases do Painel', async () => {
    renderApp()
    await esperarLista()

    const card = (rotulo) =>
      screen.getByText(rotulo, { selector: '.stat-card__label' }).closest('.stat-card')

    expect(card('Oportunidades')).toHaveTextContent('Todas as cadastradas, inclusive as decididas')
    expect(card('Em andamento')).toHaveTextContent('Ainda sem decisão registrada')
    expect(card('Aguardando decisão')).toHaveTextContent('Prontas para você decidir')
    expect(card('Com lacuna de competência'))
      .toHaveTextContent('A equipe sugerida não cobre todas as competências')
  })

  /**
   * A regra só aparecia ao parar o mouse sobre o botão, o que não existe no
   * celular nem para quem navega pelo teclado.
   */
  it('a regra do recorte de atuação fica à vista e descreve o botão', async () => {
    renderApp()
    await esperarLista()

    const botao = screen.getByRole('button', { name: /aguardando minha atuação/i })
    const regra = /sem responsável ou conduzidas por você, em Entrada, aguardando decisão ou com resposta do Demandante a um pedido de revisão/i

    expect(screen.getByText(regra)).toBeVisible()
    expect(botao).toHaveAccessibleDescription(regra)
  })

  it('a coluna Atualizada mostra a data completa ao passar o mouse', async () => {
    const instante = '2026-10-31T13:05:00.000Z'
    api.listOportunidades.mockResolvedValue({
      results: [{ ...comoApi(OPORTUNIDADES_EXEMPLO[0]), atualizada_em: instante }],
    })
    renderApp()
    await esperarLista()

    const data = screen.getByText('Bioinsumo para cana-de-açúcar')
      .closest('tr')
      .querySelector('[data-label="Atualizada"] time')
    const local = new Date(instante)
    const hora = local.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

    expect(data).toHaveAttribute('datetime', instante)
    expect(data).toHaveAttribute('title', `Atualizada em ${local.toLocaleDateString('pt-BR')} às ${hora}`)
  })

  /**
   * A fila chega em páginas de 100. Pedir a ordem ao servidor garante que a
   * oportunidade de prioridade alta parada há meses entra na primeira página.
   */
  it('pede ao servidor a fila já ordenada pela prioridade', async () => {
    servidorResponde(OPORTUNIDADES_EXEMPLO)
    renderApp()
    await esperarLista()

    expect(api.listOportunidades).toHaveBeenCalledWith({ ordenar: 'prioridade', page: '1' })
  })

  it('carrega todas as páginas da API, e não só as primeiras 100', async () => {
    /**
     * A tela lia só a primeira página de 100: da 101ª oportunidade em diante,
     * nada aparecia, nem na busca, nos filtros ou nos números do topo.
     */
    const [primeira, ...resto] = OPORTUNIDADES_EXEMPLO.map(comoApi)
    const total = OPORTUNIDADES_EXEMPLO.length

    api.listOportunidades
      .mockResolvedValueOnce({ count: total, next: '/?page=2', results: [primeira] })
      .mockResolvedValueOnce({ count: total, next: null, results: resto })

    renderApp()

    expect(await screen.findByText(`Mostrando 1–${total} de ${total}`)).toBeInTheDocument()
    expect(api.listOportunidades).toHaveBeenNthCalledWith(2, { ordenar: 'prioridade', page: '2' })
  })

  it('mostra a data do cadastro, que é a que o filtro de datas usa', async () => {
    /**
     * O filtro "Cadastrada a partir de / até" usa a data do cadastro, e a
     * tabela só mostrava "Atualizada", a última mudança. Sem a coluna, quem
     * filtrava não conferia na lista o que o filtro tinha feito.
     */
    const user = userEvent.setup()
    renderApp()
    await esperarLista()

    const item = OPORTUNIDADES_EXEMPLO[0]
    const linha = screen.getByText(item.titulo).closest('tr')

    expect(screen.getByRole('columnheader', { name: /cadastrada/i })).toBeInTheDocument()
    expect(linha).toHaveTextContent(new Date(item.criadaEm).toLocaleDateString('pt-BR'))

    await user.click(screen.getByRole('button', { name: 'Ordenar por Cadastrada' }))

    const maisAntiga = [...OPORTUNIDADES_EXEMPLO].sort((a, b) => a.criadaEm - b.criadaEm)[0]

    expect(screen.getAllByRole('row')[1]).toHaveTextContent(maisAntiga.titulo)
  })

  it('mostra a fila em páginas de 25, com "Todos" no fim', async () => {
    const user = userEvent.setup()
    const volume = Array.from({ length: 30 }, (_, indice) => ({
      ...OPORTUNIDADES_EXEMPLO[0],
      id: `OP-2026-${100 + indice}`,
      titulo: `Oportunidade de volume ${indice + 1}`,
    }))
    const total = OPORTUNIDADES_EXEMPLO.length + volume.length

    servidorResponde([...OPORTUNIDADES_EXEMPLO, ...volume])
    renderApp()

    expect(await screen.findByText(`Mostrando 1–25 de ${total}`)).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()

    const seletor = screen.getByLabelText(/linhas por página/i)

    expect(within(seletor).getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
      '10',
      '25',
      '50',
      'Todos',
    ])

    await user.selectOptions(seletor, 'Todos')

    expect(screen.getByText(`Mostrando 1–${total} de ${total}`)).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 1')).toBeInTheDocument()
  })

  it('lembra quantas linhas a pessoa escolheu', async () => {
    const user = userEvent.setup()
    const { unmount } = renderApp()
    await esperarLista()

    await user.selectOptions(screen.getByLabelText(/linhas por página/i), 'Todos')
    unmount()

    renderApp()
    await esperarLista()

    expect(screen.getByLabelText(/linhas por página/i)).toHaveDisplayValue('Todos')
  })

  it('busca por título, código e demandante', async () => {
    const user = userEvent.setup()
    renderApp()
    await esperarLista()

    await user.type(screen.getByLabelText(/buscar oportunidades/i), 'OP-2026-013')

    expect(screen.getByText('Controle de Listeria em linha de laticínios')).toBeInTheDocument()
    expect(screen.queryByText('Bioinsumo para cana-de-açúcar')).not.toBeInTheDocument()
  })

  it('separa a busca dos filtros de refino, todos com rótulo visível', async () => {
    renderApp()
    await esperarLista()

    const filtros = screen.getByRole('region', { name: /filtros da fila/i })
    const refino = filtros.querySelector('.filtros-oportunidades__refino')

    expect(within(filtros).getByLabelText(/buscar oportunidades/i)).toBeInTheDocument()
    expect(within(refino).getByLabelText('Situação')).toHaveRole('combobox')
    expect(within(refino).getByLabelText('Origem')).toHaveRole('combobox')
    expect(within(refino).getByLabelText('Cadastrada a partir de')).toBeInTheDocument()
    expect(within(refino).getByLabelText('Cadastrada até')).toBeInTheDocument()
  })

  it('filtra pelo dia do cadastro, com os dois limites inclusivos', async () => {
    const [antiga, recente, nova] = OPORTUNIDADES_EXEMPLO
    servidorResponde([
      { ...antiga, criadaEm: Date.parse('2026-09-01T12:00:00') },
      { ...recente, criadaEm: Date.parse('2026-09-15T12:00:00') },
      { ...nova, criadaEm: Date.parse('2026-10-01T12:00:00') },
    ])
    const user = userEvent.setup()
    renderApp()
    await screen.findByText(antiga.titulo, {}, { timeout: 2000 })

    await user.type(screen.getByLabelText(/cadastrada a partir de/i), '2026-09-15')
    await user.type(screen.getByLabelText(/cadastrada até/i), '2026-09-15')

    expect(screen.getByText(recente.titulo)).toBeInTheDocument()
    expect(screen.queryByText(antiga.titulo)).not.toBeInTheDocument()
    expect(screen.queryByText(nova.titulo)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /limpar filtros/i }))

    expect(screen.getByText(antiga.titulo)).toBeInTheDocument()
  })

  it('o Supervisor recorta a fila no que aguarda a atuação dele', async () => {
    const [primeira, segunda, terceira] = OPORTUNIDADES_EXEMPLO
    servidorResponde([
      { ...primeira, aguardaMinhaAtuacao: true },
      { ...segunda, aguardaMinhaAtuacao: false },
      { ...terceira, aguardaMinhaAtuacao: true },
    ])
    const user = userEvent.setup()
    renderApp()
    await screen.findByText(primeira.titulo, {}, { timeout: 2000 })

    const botao = screen.getByRole('button', { name: /aguardando minha atuação \(2\)/i })
    expect(botao).toHaveAttribute('aria-pressed', 'false')

    await user.click(botao)

    expect(botao).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(primeira.titulo)).toBeInTheDocument()
    expect(screen.getByText(terceira.titulo)).toBeInTheDocument()
    expect(screen.queryByText(segunda.titulo)).not.toBeInTheDocument()
  })

  it('o recorte de atuação não aparece para o Pesquisador', async () => {
    entrarComo('pesquisador', 'Maria Ferreira')
    renderApp()
    await esperarLista()

    expect(screen.queryByRole('button', { name: /aguardando minha atuação/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/sem responsável ou conduzidas por você/i)).not.toBeInTheDocument()
  })

  it('leva o Supervisor ao cadastro de ideia interna', async () => {
    renderApp()
    await esperarLista()

    expect(screen.getByRole('link', { name: /nova ideia interna/i })).toHaveAttribute(
      'href',
      '/oportunidades/nova'
    )
  })

  it('não oferece o cadastro de ideia interna ao Pesquisador', async () => {
    entrarComo('pesquisador', 'Maria Ferreira')
    renderApp()
    await esperarLista()

    expect(screen.queryByRole('link', { name: /nova ideia interna/i })).not.toBeInTheDocument()
  })
})

describe('OportunidadePage', () => {
  it('abre na etapa em que a oportunidade está e oferece as nove etapas do fluxo, nenhuma planejada', async () => {
    renderApp('/oportunidades/OP-2026-014')

    await screen.findByRole('heading', { level: 1 })
    expect(abaDaNavegacao(/^decisão/i)).toHaveAttribute('aria-current', 'step')
    expect(api.obterOportunidade).toHaveBeenCalledWith('OP-2026-014')

    for (const etapa of [
      /^contexto/i,
      /^copiloto/i,
      /proposta estruturada/i,
      /^competências/i,
      /equipe potencial/i,
      /pré-análise/i,
      /^decisão/i,
      /^anexos/i,
      /^histórico/i,
    ]) {
      expect(abaDaNavegacao(etapa)).toBeInTheDocument()
    }

    expect(screen.queryByText('Planejado')).not.toBeInTheDocument()
  })

  it('oferece volta explícita para a lista, não só o breadcrumb', async () => {
    renderApp('/oportunidades/OP-2026-014')

    await screen.findByRole('heading', { level: 1 })

    expect(screen.getByRole('link', { name: /voltar para oportunidades/i }))
      .toHaveAttribute('href', '/oportunidades')
  })

  it('não simula resultado: sem execução, a pré-análise declara a ausência', async () => {
    const user = userEvent.setup()
    api.obterPreAnalise.mockRejectedValue({
      data: { codigo: 'preanalise_inexistente' },
    })

    renderApp('/oportunidades/OP-2026-014')

    await screen.findByRole('heading', { level: 1 })
    await user.click(abaDaNavegacao(/pré-análise/i))

    expect(
      await screen.findByText(/nenhuma pré-análise foi executada/i),
    ).toBeInTheDocument()
  })

  it('o escopo do detalhe é do servidor: recusa vira "não encontrada"', async () => {
    api.obterOportunidade.mockRejectedValue(
      Object.assign(new Error('Não encontrado.'), { status: 404 }),
    )
    entrarComo('pesquisador', 'Maria Ferreira')

    renderApp('/oportunidades/OP-2026-011')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Oportunidade não encontrada' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^decisão/i })).not.toBeInTheDocument()
  })

  it('o Supervisor alcança a oportunidade que o servidor devolve', async () => {
    servidorDetalha('OP-2026-011')

    renderApp('/oportunidades/OP-2026-011')

    expect(await screen.findByRole('heading', { name: 'Cultura starter para queijo artesanal', level: 1 }))
      .toBeInTheDocument()
  })

  it('registra a decisão do Supervisor com justificativa obrigatória', async () => {
    const user = userEvent.setup()

    api.registrarDecisao.mockImplementation(async () => {
      servidorDetalha('OP-2026-014', {
        situacao: 'continuar',
        ultima_decisao: {
          tipo: 'continuar',
          tipo_rotulo: 'Continuar',
          justificativa: 'Maturidade suficiente e equipe coberta.',
          autor_nome: 'Rafael Antunes',
          registrada_em: '2026-09-17T10:00:00.000Z',
        },
      })
      return {}
    })

    renderApp('/oportunidades/OP-2026-014')

    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: /^decisão/i }))
    await user.click(screen.getByRole('button', { name: /registrar decisão/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/escolha o encaminhamento/i)
    expect(api.registrarDecisao).not.toHaveBeenCalled()

    await user.click(screen.getByRole('radio', { name: /continuar/i }))
    await user.click(screen.getByRole('button', { name: /registrar decisão/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/descreva o motivo/i)
    expect(api.registrarDecisao).not.toHaveBeenCalled()

    await user.type(
      screen.getByLabelText('Justificativa'),
      'Maturidade suficiente e equipe coberta.'
    )
    await user.click(screen.getByRole('button', { name: /registrar decisão/i }))

    expect(api.registrarDecisao).toHaveBeenCalledWith('OP-2026-014', {
      tipo: 'continuar',
      justificativa: 'Maturidade suficiente e equipe coberta.',
    })

    expect(await screen.findByRole('heading', { name: 'Decisão registrada', level: 2 }))
      .toBeInTheDocument()
  })

  /**
   * O relatorio e documento do Supervisor: PB71 da ao Demandante o andamento
   * sem o trabalho interno, e o Pesquisador le a oportunidade pelo recorte da
   * equipe. Oferecer o link aos outros prometeria uma tela que o guard nega.
   */
  it('leva o Supervisor ao relatório da oportunidade', async () => {
    entrarComo('supervisor', 'Rafael Antunes')
    renderApp('/oportunidades/OP-2026-014')

    const link = await screen.findByRole('link', { name: /relatório/i })

    expect(link).toHaveAttribute('href', '/oportunidades/OP-2026-014/relatorio')
  })

  it('não oferece o relatório ao Pesquisador', async () => {
    entrarComo('pesquisador', 'Maria Ferreira')
    renderApp('/oportunidades/OP-2026-014')

    await screen.findByRole('heading', { level: 1 })

    expect(screen.queryByRole('link', { name: /relatório/i })).not.toBeInTheDocument()
  })

  it('não oferece o formulário de decisão a quem não é Supervisor', async () => {
    entrarComo('pesquisador', 'Maria Ferreira')
    const user = userEvent.setup()

    renderApp('/oportunidades/OP-2026-014')

    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: /^decisão/i }))

    expect(screen.getByRole('heading', { name: 'Aguardando decisão', level: 2 })).toBeInTheDocument()
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument()
  })

  it('a trilha vem do servidor e é filtrável por categoria', async () => {
    const user = userEvent.setup()
    api.listarHistorico.mockResolvedValue(TRILHA)

    renderApp('/oportunidades/OP-2026-014')

    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: /histórico/i }))

    expect(screen.getByText('Oportunidade cadastrada.')).toBeInTheDocument()
    expect(screen.getByText('matching executado')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Matching' }))

    expect(screen.queryByText('Oportunidade cadastrada.')).not.toBeInTheDocument()
    expect(screen.getByText('matching executado')).toBeInTheDocument()
  })
})

describe('oportunidadesData', () => {
  it('separa o que está em andamento do que já teve desfecho', () => {
    expect(emAndamento({ situacao: 'matching' })).toBe(true)
    expect(emAndamento({ situacao: 'continuar' })).toBe(false)
    expect(emAndamento({ situacao: 'arquivada' })).toBe(false)
  })

  it('traduz o registro da API para o formato da tela', () => {
    const externa = daApi({
      codigo: 'OP-2026-014',
      titulo: 'Bioinsumo para cana-de-açúcar',
      origem: 'externo',
      resumo: 'Redução de perdas por contaminação.',
      contexto: '',
      demandante_nome: 'Agroindústria Vale Verde',
      responsavel_nome: 'Rafael Antunes',
      situacao: 'aguardando_decisao',
      total_anexos: 2,
      criada_em: '2026-08-25T09:00:00.000Z',
      atualizada_em: '2026-09-16T12:00:00.000Z',
    })

    expect(externa.id).toBe('OP-2026-014')
    expect(externa.demandante).toBe('Agroindústria Vale Verde')
    expect(externa.totalAnexos).toBe(2)
    expect(externa.atualizadaEm).toBe(Date.parse('2026-09-16T12:00:00.000Z'))
    expect(externa.decisao).toBeNull()
  })

  it('traduz a última decisão que o servidor devolve', () => {
    const registro = daApi({
      codigo: 'OP-2026-012',
      titulo: 'Vida de prateleira',
      origem: 'externo',
      situacao: 'revisar',
      criada_em: '2026-08-01T09:00:00.000Z',
      atualizada_em: '2026-09-14T09:00:00.000Z',
      ultima_decisao: {
        tipo: 'revisar',
        justificativa: 'Faltam os laudos.',
        autor_nome: 'Rafael Antunes',
        registrada_em: '2026-09-14T09:00:00.000Z',
      },
    })

    expect(registro.decisao.tipo).toBe('revisar')
    expect(registro.decisao.justificativa).toBe('Faltam os laudos.')
    expect(registro.decisao.autor).toBe('Rafael Antunes')
  })

  it('a ideia interna não tem demandante, e a tela mostra o Núcleo', () => {
    const interna = daApi({
      codigo: 'OP-2026-011',
      titulo: 'Cultura starter para queijo artesanal',
      origem: 'interna',
      demandante_nome: null,
      responsavel_nome: null,
      situacao: 'estruturacao',
      criada_em: '2026-09-10T09:00:00.000Z',
      atualizada_em: '2026-09-15T09:00:00.000Z',
    })

    expect(interna.demandante).toBe(NUCLEO_INTERNO)
    expect(interna.responsavel).toBe('')
  })

  it('traduz o resumo da equipe que o servidor manda', () => {
    const registro = daApi({
      codigo: 'OP-2026-009',
      titulo: 'Redução de nitrito em embutidos',
      origem: 'externo',
      demandante_nome: 'Cooperativa Terra Boa',
      situacao: 'continuar',
      criada_em: '2026-07-01T09:00:00.000Z',
      atualizada_em: '2026-09-01T09:00:00.000Z',
      resumo_da_equipe: { estado: 'com_equipe', membros: 2, lacunas: 1 },
    })

    expect(registro.equipe).toEqual({ estado: 'com_equipe', membros: 2, lacunas: 1 })
  })

  it('sem resumo da equipe, como na lista do Demandante, a equipe chega nula', () => {
    const registro = daApi({
      codigo: 'OP-2026-009',
      titulo: 'Redução de nitrito em embutidos',
      origem: 'externo',
      demandante_nome: 'Cooperativa Terra Boa',
      situacao: 'continuar',
      criada_em: '2026-07-01T09:00:00.000Z',
      atualizada_em: '2026-09-01T09:00:00.000Z',
    })

    expect(registro.equipe).toBeNull()
    expect(resumoPorSituacao([registro]).comLacuna).toBe(0)
  })
})
