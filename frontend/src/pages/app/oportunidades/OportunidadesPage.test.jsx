import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OportunidadePage from './OportunidadePage'
import OportunidadesPage from './OportunidadesPage'
import { disponibilizadasPara, emAndamento } from './oportunidadesData'

/**
 * Oportunidades — lista e shell de condução.
 *
 * As regras de domínio que estes testes protegem são as que o modelo antigo
 * violava: o Pesquisador NÃO navega um catálogo (D02), NÃO aceita nem recusa
 * (RN-A06) e NÃO decide (RN-A07). O escopo é resolvido pela tela, não por
 * filtro que o usuário possa desfazer.
 */
const auth = { user: null, isAuthenticated: true }

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

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
  entrarComo('supervisor', 'Rafael Antunes')
})

describe('OportunidadesPage', () => {
  it('mostra a fila inteira e os indicadores ao Supervisor', async () => {
    renderApp()
    await esperarLista()

    expect(screen.getByRole('heading', { name: 'Oportunidades', level: 1 })).toBeInTheDocument()

    const decisao = screen.getByText('Aguardando sua decisão').closest('.stat-card')
    expect(within(decisao).getByText('1')).toBeInTheDocument()

    expect(screen.getByText('Cultura starter para queijo artesanal')).toBeInTheDocument()
  })

  it('limita o Pesquisador às oportunidades em que ele está na equipe potencial', async () => {
    entrarComo('pesquisador', 'Maria Ferreira')
    renderApp()
    await esperarLista()

    expect(screen.getByRole('heading', { name: 'Minhas oportunidades', level: 1 })).toBeInTheDocument()

    // Ideia interna sem equipe: não é dele, e não há filtro que a traga.
    expect(screen.queryByText('Cultura starter para queijo artesanal')).not.toBeInTheDocument()

    // Nem indicadores de decisão, que não são responsabilidade dele.
    expect(screen.queryByText('Aguardando sua decisão')).not.toBeInTheDocument()
  })

  it('não entrega a lista de outro papel a quem não é Supervisor nem Pesquisador', async () => {
    entrarComo('administrador', 'Administração da plataforma')
    renderApp()

    // A rota já barra os outros papéis; a tela não confia nisso sozinha.
    expect(await screen.findByText(/não acompanha oportunidades por esta tela/i))
      .toBeInTheDocument()
    expect(screen.queryByText('Bioinsumo para cana-de-açúcar')).not.toBeInTheDocument()
  })

  it('ordena a situação pela etapa do fluxo, não pelo alfabeto', async () => {
    const user = userEvent.setup()
    renderApp()
    await esperarLista()

    await user.click(screen.getByRole('button', { name: /ordenar por situação/i }))

    const primeiro = document.querySelectorAll('.oportunidade-link__titulo')[0].textContent
    // "Em estruturação" (etapa 2) vem antes de "Aguardando decisão" (etapa 6).
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

    // Quem abriu um registro quer saber como SAIR dele — e o alvo precisa ser
    // um link de verdade, não a seta do navegador.
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

    // OP-2026-011 é ideia interna sem equipe: escopar só a listagem seria escopo
    // nenhum, bastaria digitar o código na URL.
    renderApp('/oportunidades/OP-2026-011')

    expect(screen.getByText(/nenhuma oportunidade com o código/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^decisão/i })).not.toBeInTheDocument()
  })

  it('o Supervisor alcança a mesma oportunidade que o Pesquisador não alcança', () => {
    renderApp('/oportunidades/OP-2026-011')

    expect(screen.getByRole('heading', { name: 'Cultura starter para queijo artesanal', level: 1 }))
      .toBeInTheDocument()
  })

  it('não oferece link para a tela de ideia interna, que ainda não existe', async () => {
    renderApp()
    await esperarLista()

    const botao = screen.getByRole('button', { name: /nova ideia interna/i })
    expect(botao).toBeDisabled()
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
})
