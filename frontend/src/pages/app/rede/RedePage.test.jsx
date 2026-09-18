import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RedeFormPage from './RedeFormPage'
import RedePage from './RedePage'
import { completudeDoPerfil, titulacaoLabel } from './redeData'

const api = vi.hoisted(() => ({
  listarRede: null,
  obterMembroRede: null,
  criarMembroRede: null,
  atualizarMembroRede: null,
  liberarAcessoMembro: null,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  listarRede: (...args) => api.listarRede(...args),
  obterMembroRede: (...args) => api.obterMembroRede(...args),
  criarMembroRede: (...args) => api.criarMembroRede(...args),
  atualizarMembroRede: (...args) => api.atualizarMembroRede(...args),
  liberarAcessoMembro: (...args) => api.liberarAcessoMembro(...args),
}))

const MARIA = {
  id_membro: 1,
  nome: 'Maria Ferreira',
  email: 'maria.ferreira@ac2microbiologia.com.br',
  papel_rede: 'pesquisador',
  titulacao_codigo: 'doutorado',
  organizacao_nome: 'AC2 Microbiologia',
  disponibilidade: 'parcial',
  experiencia: '11 anos em pesquisa aplicada de bioinsumos.',
  situacao: 'ativo',
  competencias: ['Microbiologia de alimentos', 'Fermentação'],
  tecnicas: ['PCR em tempo real'],
  linhas: ['Bioinsumos agrícolas'],
  tem_acesso: true,
}

const HELENA = {
  ...MARIA,
  id_membro: 3,
  nome: 'Helena Torres',
  email: 'helena.torres@ac2microbiologia.com.br',
  titulacao_codigo: 'mestrado',
  competencias: ['Biologia molecular', 'Bioinformática'],
  tecnicas: ['Sequenciamento'],
  linhas: ['Microbiota de solo'],
}

const CARLA = {
  ...MARIA,
  id_membro: 5,
  nome: 'Carla Nogueira',
  email: 'carla.nogueira@ac2microbiologia.com.br',
  papel_rede: 'colaborador',
  situacao: 'sem_acesso',
  competencias: ['Química analítica'],
  tecnicas: [],
  linhas: [],
  tem_acesso: false,
}

const PEDRO = {
  ...MARIA,
  id_membro: 6,
  nome: 'Pedro Salgado',
  email: 'pedro.salgado@ac2microbiologia.com.br',
  papel_rede: 'graduando',
  titulacao_codigo: 'graduacao',
  competencias: ['Cultivo microbiano'],
  tecnicas: [],
  linhas: [],
}

const BANCADA = {
  ...MARIA,
  id_membro: 7,
  nome: 'Núcleo de P&D — Bancada 2',
  email: 'bancada2@ac2microbiologia.com.br',
  papel_rede: 'colaborador',
  titulacao_codigo: 'graduacao',
  situacao: 'inativo',
  competencias: [],
  tecnicas: [],
  linhas: [],
  tem_acesso: false,
}

const REDE = [MARIA, HELENA, CARLA, PEDRO, BANCADA]

function renderRede(rota = '/rede') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/rede" element={<RedePage />} />
        <Route path="/rede/novo" element={<RedeFormPage />} />
        <Route path="/rede/:id" element={<RedeFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

async function esperarLista() {
  await screen.findByText('Maria Ferreira', {}, { timeout: 2000 })
}

beforeEach(() => {
  api.listarRede = vi.fn().mockResolvedValue({ results: REDE })
  api.obterMembroRede = vi.fn().mockResolvedValue(MARIA)
  api.criarMembroRede = vi.fn().mockResolvedValue({ ...CARLA, id_membro: 9 })
  api.atualizarMembroRede = vi.fn().mockResolvedValue(MARIA)
  api.liberarAcessoMembro = vi.fn().mockResolvedValue({ ...CARLA, situacao: 'ativo', tem_acesso: true })
})

describe('RedePage', () => {
  it('conta quantos perfis estão invisíveis para o matching', async () => {
    renderRede()
    await esperarLista()

    const alerta = screen.getByText('Sem competência declarada').closest('.stat-card')
    expect(within(alerta).getByText('1')).toBeInTheDocument()

    const linha = screen.getByText('Núcleo de P&D — Bancada 2').closest('tr')
    expect(within(linha).getByText(/invisível ao matching/i)).toBeInTheDocument()
  })

  it('busca também por competência, não só por nome', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    await user.type(screen.getByLabelText(/buscar na rede interna/i), 'bioinformática')

    expect(screen.getByText('Helena Torres')).toBeInTheDocument()
    expect(screen.queryByText('Maria Ferreira')).not.toBeInTheDocument()
  })

  it('ordena por titulação pela hierarquia, não pelo alfabeto', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    await user.click(screen.getByRole('button', { name: /ordenar por titulação/i }))

    const primeiro = document.querySelectorAll('.user-cell__name')[0].textContent
    expect(['Pedro Salgado', 'Núcleo de P&D — Bancada 2']).toContain(primeiro)
  })

  it('libera acesso pela API de quem está cadastrado sem login', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    const linha = screen.getByText('Carla Nogueira').closest('tr')
    expect(within(linha).getByText('Sem acesso')).toBeInTheDocument()

    await user.click(within(linha).getByRole('button', { name: /ações para carla nogueira/i }))
    await user.click(screen.getByRole('menuitem', { name: /liberar acesso/i }))

    expect(api.liberarAcessoMembro).toHaveBeenCalledWith(5)
    expect(await screen.findByText(/acesso liberado para carla nogueira/i)).toBeInTheDocument()
  })

  it('não oferece liberar acesso a quem já tem login', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    const linha = screen.getByText('Maria Ferreira').closest('tr')
    await user.click(within(linha).getByRole('button', { name: /ações para maria ferreira/i }))

    expect(screen.queryByRole('menuitem', { name: /liberar acesso/i })).not.toBeInTheDocument()
  })

  it('abre a ficha clicando na pessoa, sem passar pelo menu', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    await user.click(screen.getByRole('button', { name: /abrir a ficha de helena torres/i }))

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent('Biologia molecular')
    expect(dialogo).toHaveTextContent('Sequenciamento')
  })

  it('a ficha manda editar na página, não dentro do modal', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    await user.click(screen.getByRole('button', { name: /abrir a ficha de helena torres/i }))

    const dialogo = screen.getByRole('dialog')

    expect(within(dialogo).getByRole('link', { name: /editar cadastro/i }))
      .toHaveAttribute('href', '/rede/3')
    expect(within(dialogo).queryByLabelText('Nome')).not.toBeInTheDocument()
  })

  it('avisa e oferece nova tentativa quando a API falha', async () => {
    const user = userEvent.setup()
    api.listarRede = vi.fn().mockRejectedValue(new Error('Sessão expirada.'))

    renderRede()

    expect(await screen.findByRole('alert')).toHaveTextContent('Sessão expirada.')

    api.listarRede = vi.fn().mockResolvedValue({ results: REDE })
    await user.click(screen.getByRole('button', { name: /tentar de novo/i }))

    await esperarLista()
  })
})

describe('RedeFormPage', () => {
  it('separa cadastrar na rede de liberar o acesso', async () => {
    renderRede('/rede/novo')

    const acesso = screen.getByRole('heading', { name: 'Acesso à plataforma', level: 2 })
      .closest('.perfil-card')

    expect(within(acesso).getByRole('checkbox')).not.toBeChecked()
  })

  it('recusa e-mail inválido antes de chamar a API', async () => {
    const user = userEvent.setup()
    renderRede('/rede/novo')

    await user.type(screen.getByLabelText('Nome'), 'Ana Prado')
    await user.type(screen.getByLabelText('E-mail'), 'sem-arroba')
    await user.click(screen.getByRole('button', { name: /cadastrar na rede/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('E-mail inválido.')
    expect(api.criarMembroRede).not.toHaveBeenCalled()
  })

  it('carrega o cadastro existente da API ao editar', async () => {
    renderRede('/rede/1')

    expect(await screen.findByDisplayValue('Maria Ferreira')).toBeInTheDocument()
    expect(api.obterMembroRede).toHaveBeenCalledWith('1')
    expect(screen.getByRole('button', { name: /salvar cadastro/i })).toBeInTheDocument()
  })

  it('grava o cadastro novo e libera o acesso quando pedido', async () => {
    const user = userEvent.setup()
    renderRede('/rede/novo')

    await user.type(screen.getByLabelText('Nome'), 'Ana Prado')
    await user.type(screen.getByLabelText('E-mail'), 'ana.prado@ac2microbiologia.com.br')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /cadastrar na rede/i }))

    expect(api.criarMembroRede).toHaveBeenCalledTimes(1)

    const corpo = api.criarMembroRede.mock.calls[0][0]
    expect(corpo.nome).toBe('Ana Prado')
    expect(corpo.email).toBe('ana.prado@ac2microbiologia.com.br')
    expect(corpo.papel_rede).toBe('pesquisador')

    expect(api.liberarAcessoMembro).toHaveBeenCalledWith(9)
    expect(await screen.findByText(/pesquisador cadastrado na rede/i)).toBeInTheDocument()
  })

  it('mostra a recusa do servidor sem perder o formulário', async () => {
    const user = userEvent.setup()
    api.criarMembroRede = vi.fn().mockRejectedValue(new Error('email: já existe cadastro com este e-mail.'))

    renderRede('/rede/novo')

    await user.type(screen.getByLabelText('Nome'), 'Ana Prado')
    await user.type(screen.getByLabelText('E-mail'), 'ana.prado@ac2microbiologia.com.br')
    await user.click(screen.getByRole('button', { name: /cadastrar na rede/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/já existe cadastro/i)
    expect(screen.getByLabelText('Nome')).toHaveValue('Ana Prado')
  })
})

describe('redeData', () => {
  it('mede a completude pelas dimensões do RF03', () => {
    const vazio = completudeDoPerfil({})
    expect(vazio.percentual).toBe(0)
    expect(vazio.faltando).toHaveLength(6)

    const completo = completudeDoPerfil({
      titulacao: 'doutorado',
      competencias: ['a'],
      tecnicas: ['b'],
      linhas: ['c'],
      experiencia: 'd',
      disponibilidade: 'parcial',
    })
    expect(completo.percentual).toBe(100)
    expect(completo.faltando).toHaveLength(0)
  })

  it('rotula a titulação pelo vocabulário controlado', () => {
    expect(titulacaoLabel('pos_doutorado')).toBe('Pós-doutorado')
    expect(titulacaoLabel('inexistente')).toBe('inexistente')
  })
})
