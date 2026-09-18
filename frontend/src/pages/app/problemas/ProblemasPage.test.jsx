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

const api = vi.hoisted(() => ({
  listOportunidades: null,
  obterOportunidade: null,
  listarHistorico: null,
  criarOportunidade: null,
  complementarOportunidade: null,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  listOportunidades: (...args) => api.listOportunidades(...args),
  obterOportunidade: (...args) => api.obterOportunidade(...args),
  listarHistorico: (...args) => api.listarHistorico(...args),
  criarOportunidade: (...args) => api.criarOportunidade(...args),
  complementarOportunidade: (...args) => api.complementarOportunidade(...args),
}))

const BIOINSUMO = {
  codigo: 'OP-2026-014',
  titulo: 'Bioinsumo para cana-de-açúcar',
  origem: 'externo',
  resumo: 'Redução de perdas por contaminação microbiana na moagem.',
  contexto: '',
  demandante_nome: 'Agroindústria Vale Verde',
  responsavel_nome: 'Rafael Antunes',
  situacao: 'aguardando_decisao',
  total_anexos: 0,
  ultima_decisao: null,
  criada_em: '2026-08-20T10:00:00.000Z',
  atualizada_em: '2026-09-16T10:00:00.000Z',
}

const SUCO = {
  ...BIOINSUMO,
  codigo: 'OP-2026-012',
  titulo: 'Vida de prateleira de suco integral',
  resumo: 'Perda de qualidade sensorial antes do prazo do rótulo.',
  situacao: 'revisar',
  ultima_decisao: {
    tipo: 'revisar',
    tipo_rotulo: 'Revisar',
    justificativa: 'Faltam os laudos microbiológicos dos lotes afetados.',
    autor_nome: 'Rafael Antunes',
    registrada_em: '2026-09-14T10:00:00.000Z',
  },
}

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

  api.listOportunidades = vi.fn().mockResolvedValue({ results: [BIOINSUMO, SUCO] })
  api.obterOportunidade = vi.fn().mockResolvedValue(BIOINSUMO)
  api.listarHistorico = vi.fn().mockResolvedValue([])
  api.criarOportunidade = vi.fn().mockResolvedValue({ ...BIOINSUMO, codigo: 'OP-2026-020' })
  api.complementarOportunidade = vi.fn().mockResolvedValue({})
})

describe('ProblemasPage', () => {
  it('lista o que a API devolve, com o recorte já resolvido no servidor', async () => {
    renderApp()
    await esperarLista()

    expect(screen.getByText('Vida de prateleira de suco integral')).toBeInTheDocument()
    expect(api.listOportunidades).toHaveBeenCalledTimes(1)
  })

  it('avisa e oferece nova tentativa quando a API falha', async () => {
    const user = userEvent.setup()
    api.listOportunidades = vi.fn().mockRejectedValue(new Error('Servidor fora do ar.'))

    renderApp()

    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor fora do ar.')

    api.listOportunidades = vi.fn().mockResolvedValue({ results: [BIOINSUMO] })
    await user.click(screen.getByRole('button', { name: /tentar de novo/i }))

    expect(await screen.findByText('Bioinsumo para cana-de-açúcar')).toBeInTheDocument()
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
    api.listOportunidades = vi.fn().mockResolvedValue({ results: [] })
    renderApp()

    const vazio = (await screen.findByText(/nenhum problema encontrado/i)).closest('.table-empty')

    expect(within(vazio).getByRole('link', { name: /cadastrar problema/i })).toHaveAttribute(
      'href',
      '/problemas/novo'
    )
  })
})

describe('ProblemaFormPage', () => {
  it('recusa o cadastro sem título e sem resumo, sem chamar a API', async () => {
    const user = userEvent.setup()
    renderApp('/problemas/novo')

    await user.click(screen.getByRole('button', { name: /cadastrar problema/i }))

    expect(screen.getByText(/informe um título/i)).toBeInTheDocument()
    expect(screen.getByText(/descreva o problema/i)).toBeInTheDocument()
    expect(api.criarOportunidade).not.toHaveBeenCalled()
  })

  it('vincula o registro à organização de quem está logado, sem deixar editar', () => {
    renderApp('/problemas/novo')

    const campo = screen.getByLabelText(/organização demandante/i)

    expect(campo).toHaveValue('Agroindústria Vale Verde')
    expect(campo).toHaveAttribute('readonly')
  })

  it('manda o cadastro para a API e confirma com o código devolvido', async () => {
    const user = userEvent.setup()
    renderApp('/problemas/novo')

    await user.type(screen.getByLabelText(/^título$/i), 'Espuma no tanque de fermentação')
    await user.type(
      screen.getByLabelText(/resumo do problema/i),
      'Espuma excessiva desde a troca de insumo.'
    )
    await user.type(
      screen.getByLabelText(/resultado esperado/i),
      'Voltar ao rendimento anterior.'
    )
    await user.click(screen.getByRole('button', { name: /cadastrar problema/i }))

    expect(api.criarOportunidade).toHaveBeenCalledTimes(1)

    const enviado = api.criarOportunidade.mock.calls[0][0]
    expect(enviado.titulo).toBe('Espuma no tanque de fermentação')
    expect(enviado.resumo).toBe('Espuma excessiva desde a troca de insumo.')
    expect(enviado.contexto).toContain('Resultado esperado: Voltar ao rendimento anterior.')

    expect(await screen.findByText(/OP-2026-020 cadastrado/i)).toBeInTheDocument()
  })

  it('mostra a recusa do servidor sem perder o que foi digitado', async () => {
    const user = userEvent.setup()
    api.criarOportunidade = vi.fn().mockRejectedValue(new Error('titulo: já existe um registro igual.'))

    renderApp('/problemas/novo')

    await user.type(screen.getByLabelText(/^título$/i), 'Espuma no tanque')
    await user.type(screen.getByLabelText(/resumo do problema/i), 'Espuma desde a troca.')
    await user.click(screen.getByRole('button', { name: /cadastrar problema/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/já existe um registro igual/i)
    expect(screen.getByLabelText(/^título$/i)).toHaveValue('Espuma no tanque')
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
    await screen.findByText(/cadastrado/i)

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

  it('renderiza a trilha que a API devolve, em linguagem de negócio', async () => {
    api.listarHistorico = vi.fn().mockResolvedValue([
      {
        ocorrido_em: '2026-08-20T10:00:00.000Z',
        categoria: 'oportunidade',
        tipo: 'oportunidade_cadastrada',
        ator: 'Agroindústria Vale Verde',
        status: 'sucesso',
        detalhe: {},
      },
    ])

    renderApp('/problemas/OP-2026-014')

    expect(await screen.findByText('Oportunidade cadastrada.')).toBeInTheDocument()
    expect(screen.getByText(/análise interna do núcleo/i)).toBeInTheDocument()
  })

  it('abre a complementação com o pedido do Supervisor e envia pela API', async () => {
    const user = userEvent.setup()
    api.obterOportunidade = vi.fn().mockResolvedValue(SUCO)

    renderApp('/problemas/OP-2026-012')

    expect(await screen.findByRole('heading', { name: /pediu uma complementação/i })).toBeInTheDocument()
    expect(screen.getByText(/laudos microbiológicos/i)).toBeInTheDocument()

    const enviar = screen.getByRole('button', { name: /enviar complementação/i })
    expect(enviar).toBeDisabled()

    await user.type(screen.getByLabelText(/sua complementação/i), 'Laudos anexados na próxima semana.')
    await user.click(enviar)

    expect(api.complementarOportunidade).toHaveBeenCalledWith('OP-2026-012', {
      texto: 'Laudos anexados na próxima semana.',
    })
    expect(await screen.findByText(/complementação enviada/i, { selector: 'p' })).toBeInTheDocument()
  })

  it('recusa o problema de outra organização com o que a API responder', async () => {
    api.obterOportunidade = vi.fn().mockRejectedValue(new Error('Não encontrado.'))

    renderApp('/problemas/OP-2026-013')

    expect(await screen.findByRole('heading', { name: /não encontrado/i })).toBeInTheDocument()
    expect(screen.queryByText('Controle de Listeria em linha de laticínios')).not.toBeInTheDocument()
  })

  it('mostra o encaminhamento sem expor a justificativa interna', async () => {
    api.obterOportunidade = vi.fn().mockResolvedValue({
      ...BIOINSUMO,
      codigo: 'OP-2026-009',
      titulo: 'Redução de nitrito em embutidos',
      situacao: 'continuar',
      ultima_decisao: {
        tipo: 'continuar',
        tipo_rotulo: 'Continuar',
        justificativa: '',
        autor_nome: 'Rafael Antunes',
        registrada_em: '2026-09-06T10:00:00.000Z',
      },
    })

    renderApp('/problemas/OP-2026-009')

    await screen.findByRole('heading', { name: /redução de nitrito/i })

    const encaminhamento = screen
      .getByRole('heading', { name: /encaminhamento do núcleo/i })
      .closest('.perfil-card')

    expect(within(encaminhamento).getByText('Continuar')).toBeInTheDocument()
    expect(screen.queryByText(/maturidade suficiente/i)).not.toBeInTheDocument()
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
