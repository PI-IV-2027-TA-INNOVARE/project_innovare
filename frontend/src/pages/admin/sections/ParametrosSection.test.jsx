import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ParametrosSection from './ParametrosSection'

const auth = { user: null, isAuthenticated: true }

const api = vi.hoisted(() => ({
  listarCriteriosPreAnalise: null,
  importarCriteriosPreAnalise: null,
  lerContatosSuporte: null,
  gravarContatosSuporte: null,
  restaurarContatosSuporte: null,
}))

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  listarCriteriosPreAnalise: (...args) => api.listarCriteriosPreAnalise(...args),
  importarCriteriosPreAnalise: (...args) => api.importarCriteriosPreAnalise(...args),
  lerContatosSuporte: (...args) => api.lerContatosSuporte(...args),
  gravarContatosSuporte: (...args) => api.gravarContatosSuporte(...args),
  restaurarContatosSuporte: (...args) => api.restaurarContatosSuporte(...args),
}))

const CONTATOS_PADRAO = [
  { nome: 'Núcleo de P&D — AC2', email: 'pd@ac2microbiologia.com.br', papel: 'Cadastro e liberação de acesso' },
  { nome: 'Administração da plataforma', email: 'admin@ac2microbiologia.com.br', papel: 'Contas, perfis e permissões' },
]

function criterio(id, codigo, dimensao, dimensao_rotulo, descricao, versao = 'V2') {
  return { id_criterio: id, codigo, dimensao, dimensao_rotulo, descricao, versao }
}

const CRITERIOS = [
  criterio(1, 'B2', 'equipe_supervisao', 'Equipe e supervisão', 'Capacidade técnica — A equipe tem experiência para executar o projeto?'),
  criterio(2, 'A4', 'desafio_tecnologico', 'Desafio tecnológico', 'Desafio frente ao estado da arte — Os desafios estão situados frente ao estado da arte?'),
  criterio(3, 'B1', 'equipe_supervisao', 'Equipe e supervisão', 'Liderança técnica — PR ou PP possui perfil para liderar o desenvolvimento?'),
]

beforeEach(() => {
  api.lerContatosSuporte = vi.fn().mockResolvedValue(CONTATOS_PADRAO)
  api.gravarContatosSuporte = vi.fn().mockImplementation(async (contatos) => contatos)
  api.restaurarContatosSuporte = vi.fn().mockResolvedValue(CONTATOS_PADRAO)
  api.listarCriteriosPreAnalise = vi.fn().mockResolvedValue(CRITERIOS)
  api.importarCriteriosPreAnalise = vi.fn()
  auth.user = {
    role: 'administrador',
    displayName: 'Administração da plataforma',
    email: 'admin@ac2microbiologia.com.br',
  }
})

function renderParametros() {
  return render(<ParametrosSection />)
}

describe('ParametrosSection', () => {
  it('parte dos contatos que o servidor devolve', async () => {
    renderParametros()

    expect(await screen.findByDisplayValue('pd@ac2microbiologia.com.br')).toBeInTheDocument()
    expect(screen.getByDisplayValue('admin@ac2microbiologia.com.br')).toBeInTheDocument()
  })

  it('recusa e-mail inválido sem chamar o servidor', async () => {
    const user = userEvent.setup()
    renderParametros()

    const campo = await screen.findByDisplayValue('pd@ac2microbiologia.com.br')
    await user.clear(campo)
    await user.type(campo, 'pd-arroba-ac2')
    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))

    expect(screen.getByText(/e-mail inválido/i)).toBeInTheDocument()
    expect(api.gravarContatosSuporte).not.toHaveBeenCalled()
  })

  it('grava no servidor, para valer na tela de acesso restrito de todos', async () => {
    const user = userEvent.setup()
    renderParametros()

    const campo = await screen.findByDisplayValue('pd@ac2microbiologia.com.br')
    await user.clear(campo)
    await user.type(campo, 'pesquisa@ac2microbiologia.com.br')
    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))

    expect(await screen.findByText(/contatos de suporte atualizados/i)).toBeInTheDocument()
    expect(api.gravarContatosSuporte).toHaveBeenCalledWith([
      { ...CONTATOS_PADRAO[0], email: 'pesquisa@ac2microbiologia.com.br' },
      CONTATOS_PADRAO[1],
    ])
  })

  it('mostra o motivo quando o servidor recusa a gravação', async () => {
    const user = userEvent.setup()
    api.gravarContatosSuporte = vi.fn().mockRejectedValue({ message: 'Sem permissão.' })
    renderParametros()

    await screen.findByDisplayValue('pd@ac2microbiologia.com.br')
    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))

    expect(await screen.findByText(/sem permissão/i)).toBeInTheDocument()
  })

  it('adiciona e remove contato', async () => {
    const user = userEvent.setup()
    renderParametros()
    await screen.findByDisplayValue('pd@ac2microbiologia.com.br')

    await user.click(screen.getByRole('button', { name: /adicionar contato/i }))
    expect(screen.getAllByLabelText('E-mail')).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: /remover contato administração da plataforma/i }))
    expect(screen.getAllByLabelText('E-mail')).toHaveLength(2)
  })

  it('não deixa salvar uma lista vazia — é a saída de quem foi barrado', async () => {
    const user = userEvent.setup()
    renderParametros()
    await screen.findByDisplayValue('pd@ac2microbiologia.com.br')

    for (const nome of [/remover contato núcleo/i, /remover contato administração/i]) {
      await user.click(screen.getByRole('button', { name: nome }))
    }

    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))

    expect(await screen.findByText(/deixe ao menos um contato/i)).toBeInTheDocument()
    expect(api.gravarContatosSuporte).not.toHaveBeenCalled()
  })

  it('restaura o padrão da AC2 pelo servidor', async () => {
    const user = userEvent.setup()
    renderParametros()

    const campo = await screen.findByDisplayValue('pd@ac2microbiologia.com.br')
    await user.clear(campo)
    await user.type(campo, 'outro@ac2microbiologia.com.br')
    await user.click(screen.getByRole('button', { name: /restaurar padrão/i }))

    expect(await screen.findByDisplayValue('pd@ac2microbiologia.com.br')).toBeInTheDocument()
    expect(api.restaurarContatosSuporte).toHaveBeenCalled()
  })

  it('mostra os critérios agrupados por dimensão, na ordem de referência', async () => {
    renderParametros()

    const grupos = await screen.findAllByRole('heading', { level: 4 })

    expect(grupos.map((grupo) => grupo.textContent)).toEqual([
      'Desafio tecnológico1',
      'Equipe e supervisão2',
    ])

    const equipe = grupos[1].closest('section')
    const codigos = within(equipe).getAllByText(/^B\d$/).map((item) => item.textContent)

    expect(codigos).toEqual(['B1', 'B2'])
  })

  it('separa o nome do critério da pergunta que ele faz', async () => {
    renderParametros()

    expect(await screen.findByText('Liderança técnica')).toBeInTheDocument()
    expect(
      screen.getByText('PR ou PP possui perfil para liderar o desenvolvimento?')
    ).toBeInTheDocument()
  })

  it('resume a versão vigente sem jargão de engenharia', async () => {
    renderParametros()

    expect(await screen.findByText('Versão V2')).toBeInTheDocument()
    expect(screen.getByText('3 critérios em 2 dimensões')).toBeInTheDocument()
    expect(screen.queryByText(/product owner|baseline|trilha|critério\(s\)/i)).not.toBeInTheDocument()
  })

  it('avisa quando ainda não há critério carregado', async () => {
    api.listarCriteriosPreAnalise = vi.fn().mockResolvedValue([])
    renderParametros()

    expect(
      await screen.findByText(/nenhum critério carregado/i)
    ).toBeInTheDocument()
  })

  it('atualiza os critérios e conta o que mudou', async () => {
    const user = userEvent.setup()
    api.importarCriteriosPreAnalise = vi.fn().mockResolvedValue({
      versao: 'V3',
      baseline_id: 'PIPE_V3',
      criados: 1,
      atualizados: 2,
    })
    renderParametros()

    await user.click(await screen.findByRole('button', { name: /atualizar critérios/i }))

    expect(
      await screen.findByText('Critérios atualizados para a versão V3: 1 novo e 2 revisados.')
    ).toBeInTheDocument()
  })

  it('não oferece edição dos critérios na tela', async () => {
    renderParametros()

    const criterios = screen
      .getByRole('heading', { name: /critérios da pré-análise/i })
      .closest('.perfil-card')

    expect(await within(criterios).findByText(/não são editados nesta tela/i)).toBeInTheDocument()
    expect(within(criterios).queryByRole('textbox')).not.toBeInTheDocument()
  })
})
