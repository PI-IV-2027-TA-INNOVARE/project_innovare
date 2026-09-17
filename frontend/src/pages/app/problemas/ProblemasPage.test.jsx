import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProblemaFormPage from './ProblemaFormPage'
import ProblemaPage from './ProblemaPage'
import ProblemasPage from './ProblemasPage'
import { historicoVisivel, problemasDe } from './problemasData'
import { OPORTUNIDADES_EXEMPLO } from '../oportunidades/oportunidadesData'

const auth = { user: null, isAuthenticated: true }

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

function entrarComo(displayName) {
  auth.user = { role: 'demandante', displayName, email: 'demandante@valeverde.com.br' }
}

function renderApp(rota = '/problemas') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/problemas" element={<ProblemasPage />} />
        <Route path="/problemas/novo" element={<ProblemaFormPage />} />
        <Route path="/problemas/:id" element={<ProblemaPage />} />
      </Routes>
    </MemoryRouter>
  )
}

async function esperarLista() {
  await screen.findByText('Bioinsumo para cana-de-açúcar', {}, { timeout: 2000 })
}

beforeEach(() => {
  window.localStorage.clear()
  entrarComo('Agroindústria Vale Verde')
})

describe('ProblemasPage', () => {
  it('lista só os problemas da própria organização', async () => {
    renderApp()
    await esperarLista()

    expect(screen.getByText('Vida de prateleira de suco integral')).toBeInTheDocument()
    expect(screen.queryByText('Controle de Listeria em linha de laticínios')).not.toBeInTheDocument()
    expect(screen.queryByText('Redução de nitrito em embutidos')).not.toBeInTheDocument()
  })

  it('não mostra ideia interna ao Demandante, nem quando o nome bate', async () => {
    entrarComo('Núcleo de P&D — AC2')
    renderApp()

    expect(await screen.findByText(/nenhum problema encontrado/i)).toBeInTheDocument()
    expect(screen.queryByText('Cultura starter para queijo artesanal')).not.toBeInTheDocument()
  })

  it('destaca quando a AC2 pediu complementação', async () => {
    renderApp()
    await esperarLista()

    const aguardando = screen.getByText('Aguardando você').closest('.stat-card')
    expect(within(aguardando).getByText('1')).toBeInTheDocument()

    const linha = screen.getByText('Vida de prateleira de suco integral').closest('tr')
    expect(within(linha).getByText(/complementação pedida/i)).toBeInTheDocument()
  })

  it('filtra por título e por código', async () => {
    const user = userEvent.setup()
    renderApp()
    await esperarLista()

    await user.type(screen.getByLabelText(/buscar problemas/i), 'OP-2026-012')

    expect(screen.getByText('Vida de prateleira de suco integral')).toBeInTheDocument()
    expect(screen.queryByText('Bioinsumo para cana-de-açúcar')).not.toBeInTheDocument()
  })

  it('oferece o cadastro quando a organização ainda não tem problema nenhum', async () => {
    entrarComo('Laticínios Sem Registro')
    renderApp()

    const vazio = (await screen.findByText(/nenhum problema encontrado/i)).closest('.table-empty')

    expect(within(vazio).getByRole('link', { name: /cadastrar problema/i })).toHaveAttribute(
      'href',
      '/problemas/novo'
    )
  })
})

describe('ProblemaFormPage', () => {
  it('recusa o cadastro sem título e sem resumo', async () => {
    const user = userEvent.setup()
    renderApp('/problemas/novo')

    await user.click(screen.getByRole('button', { name: /cadastrar problema/i }))

    expect(screen.getByText(/informe um título/i)).toBeInTheDocument()
    expect(screen.getByText(/descreva o problema/i)).toBeInTheDocument()
  })

  it('vincula o registro à organização de quem está logado, sem deixar editar', () => {
    renderApp('/problemas/novo')

    const campo = screen.getByLabelText(/organização demandante/i)

    expect(campo).toHaveValue('Agroindústria Vale Verde')
    expect(campo).toHaveAttribute('readonly')
  })

  it('confirma o cadastro quando título e resumo estão preenchidos', async () => {
    const user = userEvent.setup()
    renderApp('/problemas/novo')

    await user.type(screen.getByLabelText(/^título$/i), 'Espuma no tanque de fermentação')
    await user.type(screen.getByLabelText(/resumo do problema/i), 'Espuma excessiva desde a troca de insumo.')
    await user.click(screen.getByRole('button', { name: /cadastrar problema/i }))

    expect(await screen.findByText(/problema cadastrado/i)).toBeInTheDocument()
  })

  it('avisa que nenhum anexo sai do computador nesta versão', () => {
    renderApp('/problemas/novo')

    expect(screen.getByText(/nenhum arquivo sai do seu computador/i)).toBeInTheDocument()
  })
})

describe('ProblemaFormPage — rascunho e guarda de saída', () => {
  it('sai direto quando não há nada digitado', async () => {
    const user = userEvent.setup()
    renderApp('/problemas/novo')

    await user.click(screen.getByRole('link', { name: /cancelar/i }))

    expect(await screen.findByRole('heading', { name: /meus problemas/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /sair sem cadastrar/i })).not.toBeInTheDocument()
  })

  it('segura a saída quando há conteúdo digitado', async () => {
    const user = userEvent.setup()
    renderApp('/problemas/novo')

    await user.type(screen.getByLabelText(/^título$/i), 'Espuma no tanque')
    await user.click(screen.getByRole('link', { name: /cancelar/i }))

    expect(await screen.findByRole('heading', { name: /sair sem cadastrar/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /meus problemas/i })).not.toBeInTheDocument()
  })

  it('volta ao formulário sem perder o texto em "Continuar editando"', async () => {
    const user = userEvent.setup()
    renderApp('/problemas/novo')

    await user.type(screen.getByLabelText(/^título$/i), 'Espuma no tanque')
    await user.click(screen.getByRole('link', { name: /cancelar/i }))
    await user.click(await screen.findByRole('button', { name: /continuar editando/i }))

    expect(screen.getByLabelText(/^título$/i)).toHaveValue('Espuma no tanque')
  })

  it('guarda o rascunho ao sair e o devolve na volta', async () => {
    const user = userEvent.setup()
    const primeira = renderApp('/problemas/novo')

    await user.type(screen.getByLabelText(/^título$/i), 'Espuma no tanque')
    await user.click(screen.getByRole('link', { name: /cancelar/i }))
    await user.click(await screen.findByRole('button', { name: /sair e guardar/i }))

    primeira.unmount()
    renderApp('/problemas/novo')

    expect(screen.getByLabelText(/^título$/i)).toHaveValue('Espuma no tanque')
    expect(screen.getByText(/rascunho recuperado/i)).toBeInTheDocument()
  })

  it('descarta o rascunho quando a pessoa pede para descartar', async () => {
    const user = userEvent.setup()
    const primeira = renderApp('/problemas/novo')

    await user.type(screen.getByLabelText(/^título$/i), 'Espuma no tanque')
    await user.click(screen.getByRole('link', { name: /cancelar/i }))
    await user.click(await screen.findByRole('button', { name: /^descartar$/i }))

    primeira.unmount()
    renderApp('/problemas/novo')

    expect(screen.getByLabelText(/^título$/i)).toHaveValue('')
    expect(screen.queryByText(/rascunho recuperado/i)).not.toBeInTheDocument()
  })

  it('limpa o rascunho depois de cadastrar', async () => {
    const user = userEvent.setup()
    const primeira = renderApp('/problemas/novo')

    await user.type(screen.getByLabelText(/^título$/i), 'Espuma no tanque')
    await user.type(screen.getByLabelText(/resumo do problema/i), 'Espuma desde a troca de insumo.')
    await user.click(screen.getByRole('button', { name: /cadastrar problema/i }))
    await screen.findByText(/problema cadastrado/i)

    primeira.unmount()
    renderApp('/problemas/novo')

    expect(screen.getByLabelText(/^título$/i)).toHaveValue('')
  })

  it('não entrega o rascunho de uma organização a outra no mesmo navegador', async () => {
    const user = userEvent.setup()
    const primeira = renderApp('/problemas/novo')

    await user.type(screen.getByLabelText(/^título$/i), 'Espuma no tanque')

    primeira.unmount()
    auth.user = {
      role: 'demandante',
      displayName: 'Cooperativa Terra Boa',
      email: 'demandante@terraboa.com.br',
    }
    renderApp('/problemas/novo')

    expect(screen.getByLabelText(/^título$/i)).toHaveValue('')
    expect(screen.queryByText(/rascunho recuperado/i)).not.toBeInTheDocument()
  })
})

describe('ProblemaPage', () => {
  it('traduz a etapa interna para o que ela significa ao Demandante', async () => {
    renderApp('/problemas/OP-2026-014')

    expect(await screen.findByRole('heading', { name: /bioinsumo/i })).toBeInTheDocument()
    expect(screen.getByText(/aguardando a decisão do núcleo de p&d/i)).toBeInTheDocument()
  })

  it('esconde matching e equipe, e diz que existem registros internos', async () => {
    renderApp('/problemas/OP-2026-014')

    await screen.findByRole('heading', { name: /bioinsumo/i })

    expect(screen.queryByText(/equipe potencial sugerida/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pré-análise pipe\/fapesp executada/i)).not.toBeInTheDocument()
    expect(screen.getByText(/registros internos/i)).toBeInTheDocument()
  })

  it('abre a complementação com o pedido do Supervisor quando a decisão foi Revisar', async () => {
    const user = userEvent.setup()
    renderApp('/problemas/OP-2026-012')

    expect(await screen.findByRole('heading', { name: /pediu uma complementação/i })).toBeInTheDocument()
    expect(screen.getByText(/laudos microbiológicos/i)).toBeInTheDocument()

    const enviar = screen.getByRole('button', { name: /enviar complementação/i })
    expect(enviar).toBeDisabled()

    await user.type(screen.getByLabelText(/sua complementação/i), 'Laudos anexados na próxima semana.')
    await user.click(enviar)

    expect(await screen.findByText(/complementação enviada/i, { selector: 'p' })).toBeInTheDocument()
  })

  it('recusa o problema de outra organização mesmo com o código certo', async () => {
    renderApp('/problemas/OP-2026-013')

    expect(await screen.findByRole('heading', { name: /não encontrado/i })).toBeInTheDocument()
    expect(screen.queryByText('Controle de Listeria em linha de laticínios')).not.toBeInTheDocument()
  })

  it('mostra o encaminhamento sem expor a justificativa interna', async () => {
    entrarComo('Cooperativa Terra Boa')
    renderApp('/problemas/OP-2026-009')

    await screen.findByRole('heading', { name: /redução de nitrito/i })

    const encaminhamento = screen
      .getByRole('heading', { name: /encaminhamento do núcleo/i })
      .closest('.perfil-card')

    expect(within(encaminhamento).getByText('Continuar')).toBeInTheDocument()
    expect(screen.queryByText(/maturidade suficiente e equipe coberta/i)).not.toBeInTheDocument()
  })
})

describe('problemasData', () => {
  it('esconde as categorias internas do histórico e conta quantas ficaram de fora', () => {
    const problema = OPORTUNIDADES_EXEMPLO.find((item) => item.id === 'OP-2026-014')
    const { eventos, internos } = historicoVisivel(problema.historico)

    expect(eventos.every((evento) => ['oportunidade', 'decisao'].includes(evento.categoria))).toBe(true)
    expect(internos).toBe(problema.historico.length - eventos.length)
    expect(internos).toBeGreaterThan(0)
  })

  it('só devolve problema externo, nunca ideia interna', () => {
    for (const nome of ['Agroindústria Vale Verde', 'Núcleo de P&D — AC2']) {
      expect(problemasDe(nome).every((item) => item.origem === 'externo')).toBe(true)
    }
  })

  it('devolve lista vazia sem organização identificada', () => {
    expect(problemasDe('')).toEqual([])
    expect(problemasDe(undefined)).toEqual([])
  })
})
