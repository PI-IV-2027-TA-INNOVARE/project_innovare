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

vi.mock('../../../services/pdConnectApi', () => ({
  listOportunidades: vi.fn(),
}))

const api = await import('../../../services/pdConnectApi')

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
    criada_em: new Date(oportunidade.criadaEm).toISOString(),
    atualizada_em: new Date(oportunidade.atualizadaEm).toISOString(),
  }
}

function servidorResponde(oportunidades) {
  api.listOportunidades.mockResolvedValue({ results: oportunidades.map(comoApi) })
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
  vi.clearAllMocks()
  servidorResponde(OPORTUNIDADES_EXEMPLO)
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
})

describe('OportunidadePage', () => {
  it('abre no contexto e marca as etapas ainda não implementadas', () => {
    renderApp('/oportunidades/OP-2026-014')

    expect(screen.getByRole('heading', { name: 'Entrada', level: 2 })).toBeInTheDocument()

    const abaEquipe = screen.getByRole('button', { name: /equipe potencial/i })
    expect(within(abaEquipe).getByText('Planejado')).toBeInTheDocument()
  })

  it('oferece volta explícita para a lista, não só o breadcrumb', () => {
    renderApp('/oportunidades/OP-2026-014')

    expect(screen.getByRole('link', { name: /voltar para oportunidades/i }))
      .toHaveAttribute('href', '/oportunidades')
  })

  it('não simula resultado na etapa planejada', async () => {
    const user = userEvent.setup()
    renderApp('/oportunidades/OP-2026-014')

    await user.click(screen.getByRole('button', { name: /pré-análise/i }))

    expect(screen.getByText(/etapa ainda não implementada/i)).toBeInTheDocument()
  })

  it('escopa o detalhe, não só a lista', () => {
    entrarComo('pesquisador', 'Maria Ferreira')

    renderApp('/oportunidades/OP-2026-011')

    expect(screen.getByText(/nenhuma oportunidade com o código/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^decisão/i })).not.toBeInTheDocument()
  })

  it('o Supervisor alcança a mesma oportunidade que o Pesquisador não alcança', () => {
    renderApp('/oportunidades/OP-2026-011')

    expect(screen.getByRole('heading', { name: 'Cultura starter para queijo artesanal', level: 1 }))
      .toBeInTheDocument()
  })

  it('leva o Supervisor ao cadastro de ideia interna', async () => {
    renderApp()
    await esperarLista()

    expect(screen.getByRole('link', { name: /nova ideia interna/i })).toHaveAttribute(
      'href',
      '/oportunidades/nova'
    )
  })

  it('não oferece o cadastro de ideia interna ao Pesquisador (RN-A03)', async () => {
    entrarComo('pesquisador', 'Maria Ferreira')
    renderApp()
    await esperarLista()

    expect(screen.queryByRole('link', { name: /nova ideia interna/i })).not.toBeInTheDocument()
  })

  it('registra a decisão do Supervisor com justificativa obrigatória', async () => {
    const user = userEvent.setup()
    renderApp('/oportunidades/OP-2026-014')

    await user.click(screen.getByRole('button', { name: /^decisão/i }))
    await user.click(screen.getByRole('button', { name: /registrar decisão/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/escolha o encaminhamento/i)

    await user.click(screen.getByRole('radio', { name: /continuar/i }))
    await user.click(screen.getByRole('button', { name: /registrar decisão/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/descreva o motivo/i)

    await user.type(
      screen.getByLabelText('Justificativa'),
      'Maturidade suficiente e equipe coberta.'
    )
    await user.click(screen.getByRole('button', { name: /registrar decisão/i }))

    expect(await screen.findByText('Decisão registrada no histórico.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Decisão registrada', level: 2 })).toBeInTheDocument()
  })

  it('não oferece o formulário de decisão a quem não é Supervisor', async () => {
    entrarComo('pesquisador', 'Maria Ferreira')
    const user = userEvent.setup()
    renderApp('/oportunidades/OP-2026-014')

    await user.click(screen.getByRole('button', { name: /^decisão/i }))

    expect(screen.getByRole('heading', { name: 'Aguardando decisão', level: 2 })).toBeInTheDocument()
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument()
  })

  it('a decisão registrada entra na trilha do histórico', async () => {
    const user = userEvent.setup()
    renderApp('/oportunidades/OP-2026-014')

    await user.click(screen.getByRole('button', { name: /^decisão/i }))
    await user.click(screen.getByRole('radio', { name: /arquivar/i }))
    await user.type(screen.getByLabelText('Justificativa'), 'Escopo já coberto por projeto em curso.')
    await user.click(screen.getByRole('button', { name: /registrar decisão/i }))

    await user.click(screen.getByRole('button', { name: /histórico/i }))

    expect(screen.getByText(/decisão registrada: arquivar/i)).toBeInTheDocument()
  })

  it('filtra a trilha por categoria', async () => {
    const user = userEvent.setup()
    renderApp('/oportunidades/OP-2026-014')

    await user.click(screen.getByRole('button', { name: /histórico/i }))
    expect(screen.getByText(/proposta estruturada em rascunho/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Matching' }))

    expect(screen.queryByText(/proposta estruturada em rascunho/i)).not.toBeInTheDocument()
    expect(screen.getByText(/equipe potencial sugerida/i)).toBeInTheDocument()
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

  it('matching ainda não existe, então equipe e lacuna chegam vazias', () => {
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
    expect(registro.lacunas).toEqual([])
  })
})
