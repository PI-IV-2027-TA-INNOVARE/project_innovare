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
  disponibilizadasPara,
  emAndamento,
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
}))

vi.mock('../../../services/pdConnectApi', () => ({
  listOportunidades: (...args) => api.listOportunidades(...args),
  obterOportunidade: (...args) => api.obterOportunidade(...args),
  listarHistorico: (...args) => api.listarHistorico(...args),
  registrarDecisao: (...args) => api.registrarDecisao(...args),
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
  }
}

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

  servidorResponde(OPORTUNIDADES_EXEMPLO)
  servidorDetalha('OP-2026-014')
  entrarComo('supervisor', 'Rafael Antunes')
})

describe('OportunidadesPage', () => {
  it('mostra a fila inteira e os indicadores ao Supervisor', async () => {
    renderApp()
    await esperarLista()

    expect(api.listOportunidades).toHaveBeenCalledTimes(1)

    expect(screen.getByRole('heading', { name: 'Oportunidades', level: 1 })).toBeInTheDocument()

    const decisao = screen.getByText('Aguardando sua decisão').closest('.stat-card')
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
    servidorResponde(disponibilizadasPara('Maria Ferreira'))

    renderApp()
    await esperarLista()

    expect(screen.getByRole('heading', { name: 'Minhas oportunidades', level: 1 })).toBeInTheDocument()

    expect(screen.getByText('Controle de Listeria em linha de laticínios')).toBeInTheDocument()
    expect(screen.queryByText('Cultura starter para queijo artesanal')).not.toBeInTheDocument()

    expect(screen.queryByText('Aguardando sua decisão')).not.toBeInTheDocument()
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

  it('busca por título, código e demandante', async () => {
    const user = userEvent.setup()
    renderApp()
    await esperarLista()

    await user.type(screen.getByLabelText(/buscar oportunidades/i), 'OP-2026-013')

    expect(screen.getByText('Controle de Listeria em linha de laticínios')).toBeInTheDocument()
    expect(screen.queryByText('Bioinsumo para cana-de-açúcar')).not.toBeInTheDocument()
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
  it('abre no contexto e marca as etapas ainda não implementadas', async () => {
    renderApp('/oportunidades/OP-2026-014')

    expect(await screen.findByRole('heading', { name: 'Entrada', level: 2 })).toBeInTheDocument()
    expect(api.obterOportunidade).toHaveBeenCalledWith('OP-2026-014')

    const abaEquipe = screen.getByRole('button', { name: /equipe potencial/i })
    expect(within(abaEquipe).getByText('Planejado')).toBeInTheDocument()
  })

  it('oferece volta explícita para a lista, não só o breadcrumb', async () => {
    renderApp('/oportunidades/OP-2026-014')

    await screen.findByRole('heading', { name: 'Entrada', level: 2 })

    expect(screen.getByRole('link', { name: /voltar para oportunidades/i }))
      .toHaveAttribute('href', '/oportunidades')
  })

  it('não simula resultado na etapa planejada', async () => {
    const user = userEvent.setup()
    renderApp('/oportunidades/OP-2026-014')

    await screen.findByRole('heading', { name: 'Entrada', level: 2 })
    await user.click(screen.getByRole('button', { name: /pré-análise/i }))

    expect(screen.getByText(/etapa ainda não implementada/i)).toBeInTheDocument()
  })

  it('o escopo do detalhe é do servidor: recusa vira "não encontrada"', async () => {
    api.obterOportunidade.mockRejectedValue(new Error('Não encontrado.'))
    entrarComo('pesquisador', 'Maria Ferreira')

    renderApp('/oportunidades/OP-2026-011')

    expect(await screen.findByText(/nenhuma oportunidade com o código/i)).toBeInTheDocument()
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

    await screen.findByRole('heading', { name: 'Entrada', level: 2 })
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

  it('não oferece o formulário de decisão a quem não é Supervisor', async () => {
    entrarComo('pesquisador', 'Maria Ferreira')
    const user = userEvent.setup()

    renderApp('/oportunidades/OP-2026-014')

    await screen.findByRole('heading', { name: 'Entrada', level: 2 })
    await user.click(screen.getByRole('button', { name: /^decisão/i }))

    expect(screen.getByRole('heading', { name: 'Aguardando decisão', level: 2 })).toBeInTheDocument()
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument()
  })

  it('a trilha vem do servidor e é filtrável por categoria', async () => {
    const user = userEvent.setup()
    api.listarHistorico.mockResolvedValue(TRILHA)

    renderApp('/oportunidades/OP-2026-014')

    await screen.findByRole('heading', { name: 'Entrada', level: 2 })
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

  it('devolve ao pesquisador apenas as equipes potenciais em que ele está', () => {
    expect(disponibilizadasPara('Maria Ferreira').map((item) => item.id))
      .toEqual(['OP-2026-014', 'OP-2026-013', 'OP-2026-009'])

    expect(disponibilizadasPara('Ninguém')).toHaveLength(0)
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

  it('matching ainda não existe, então equipe, competência e lacuna chegam vazias', () => {
    const registro = daApi({
      codigo: 'OP-2026-009',
      titulo: 'Redução de nitrito em embutidos',
      origem: 'externo',
      demandante_nome: 'Cooperativa Terra Boa',
      situacao: 'continuar',
      criada_em: '2026-07-01T09:00:00.000Z',
      atualizada_em: '2026-09-01T09:00:00.000Z',
    })

    expect(registro.equipe).toEqual([])
    expect(registro.competencias).toEqual([])
    expect(registro.lacunas).toEqual([])
  })
})
