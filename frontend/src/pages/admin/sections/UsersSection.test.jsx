import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UsersSection from './UsersSection'
import {
  USUARIOS_EXEMPLO,
  formatarUltimoAcesso,
  iniciais,
  usuariosParaCsv,
} from './users/usersData'

vi.mock('../../../services/pdConnectApi', () => ({
  listUsuarios: vi.fn(),
  createUsuario: vi.fn(),
  updateUsuario: vi.fn(),
  setSituacaoUsuario: vi.fn(),
  reenviarConvite: vi.fn(),
}))

const api = await import('../../../services/pdConnectApi')

function comoApi(usuario) {
  return {
    id_usuario: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.perfil,
    situacao: usuario.status,
    instituicao: usuario.instituicao,
    ultimo_acesso: usuario.ultimoAcesso
      ? new Date(usuario.ultimoAcesso).toISOString()
      : null,
    aguardando_primeiro_acesso: false,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  api.listUsuarios.mockResolvedValue({
    results: USUARIOS_EXEMPLO.map(comoApi),
  })
})

async function renderUsuarios() {
  const resultado = render(<UsersSection />)

  await screen.findByText('Maria Ferreira', {}, { timeout: 2000 })

  return resultado
}

function linhaDe(nome) {
  return screen.getByText(nome).closest('tr')
}

describe('UsersSection', () => {
  it('busca a lista na API ao montar', async () => {
    await renderUsuarios()

    expect(api.listUsuarios).toHaveBeenCalledTimes(1)
  })

  it('mostra o esqueleto antes da lista', async () => {
    render(<UsersSection />)

    expect(document.querySelectorAll('.admin-table__skeleton-row').length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(document.querySelectorAll('.admin-table__skeleton-row')).toHaveLength(0)
    })
  })

  it('avisa e oferece nova tentativa quando a API falha', async () => {
    const user = userEvent.setup()
    api.listUsuarios.mockRejectedValueOnce(new Error('Servidor indisponível.'))

    render(<UsersSection />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor indisponível.')

    api.listUsuarios.mockResolvedValueOnce({ results: USUARIOS_EXEMPLO.map(comoApi) })
    await user.click(screen.getByRole('button', { name: /tentar de novo/i }))

    expect(await screen.findByText('Maria Ferreira')).toBeInTheDocument()
  })

  it('resume a base nos quatro indicadores', async () => {
    await renderUsuarios()

    const total = screen.getByText('Usuários totais').closest('.stat-card')
    expect(within(total).getByText('12')).toBeInTheDocument()

    const pesquisadores = screen.getByText('Pesquisadores').closest('.stat-card')
    expect(within(pesquisadores).getByText('5')).toBeInTheDocument()
  })

  it('busca por nome e por e-mail enquanto a pessoa digita', async () => {
    const user = userEvent.setup()
    await renderUsuarios()

    await user.type(screen.getByLabelText(/buscar por nome ou e-mail/i), 'valeverde')

    expect(screen.getByText('Agroindústria Vale Verde')).toBeInTheDocument()
    expect(screen.queryByText('Maria Ferreira')).not.toBeInTheDocument()
  })

  it('filtra por perfil e permite remover o filtro pelo chip', async () => {
    const user = userEvent.setup()
    await renderUsuarios()

    await user.click(screen.getByRole('button', { name: /filtros avançados/i }))
    await user.click(screen.getByRole('button', { name: 'Demandante Externo' }))

    expect(screen.queryByText('Maria Ferreira')).not.toBeInTheDocument()
    expect(screen.getByText('Agroindústria Vale Verde')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /remover filtro de perfil/i }))

    expect(screen.getByText('Maria Ferreira')).toBeInTheDocument()
  })

  it('ordena pela coluna escolhida e inverte no segundo clique', async () => {
    const user = userEvent.setup()
    await renderUsuarios()

    const cabecalho = screen.getByRole('button', { name: /ordenar por usuário/i })
    const primeiroNome = () => document.querySelectorAll('.user-cell__name')[0].textContent

    expect(primeiroNome()).toBe('Administração da plataforma')

    await user.click(cabecalho)

    expect(primeiroNome()).toBe('Rafael Antunes')
    expect(cabecalho.closest('th')).toHaveAttribute('aria-sort', 'descending')
  })

  it('pagina a lista e respeita o tamanho de página', async () => {
    const user = userEvent.setup()
    await renderUsuarios()

    expect(screen.getByText('Mostrando 1–10 de 12')).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /próxima página/i }))

    expect(screen.getByText('Mostrando 11–12 de 12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /próxima página/i })).toBeDisabled()

    await user.selectOptions(screen.getByLabelText(/linhas por página/i), '25')

    expect(screen.getByText('Mostrando 1–12 de 12')).toBeInTheDocument()
  })
})

describe('UsersSection — provisionamento', () => {
  it('cria a conta pela API e avisa que o convite saiu', async () => {
    const user = userEvent.setup()
    api.createUsuario.mockResolvedValue({
      id_usuario: 99,
      nome: 'Ana Prado',
      email: 'ana.prado@ac2microbiologia.com.br',
      papel: 'supervisor',
      situacao: 'ativo',
      instituicao: 'AC2 Microbiologia',
      ultimo_acesso: null,
      aguardando_primeiro_acesso: true,
    })
    await renderUsuarios()

    await user.click(screen.getByRole('button', { name: /novo usuário/i }))

    const dialogo = screen.getByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Nome'), 'Ana Prado')
    await user.type(
      within(dialogo).getByLabelText('E-mail'),
      'ana.prado@ac2microbiologia.com.br'
    )
    await user.click(within(dialogo).getByRole('button', { name: /criar conta e enviar convite/i }))

    expect(api.createUsuario).toHaveBeenCalledWith({
      nome: 'Ana Prado',
      email: 'ana.prado@ac2microbiologia.com.br',
      papel: 'supervisor',
    })
    expect(
      await screen.findByText('Convite enviado para ana.prado@ac2microbiologia.com.br.')
    ).toBeInTheDocument()
    expect(screen.getByText('Ana Prado')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('nao oferece Pesquisador no formulario de criacao', async () => {
    const user = userEvent.setup()
    await renderUsuarios()

    await user.click(screen.getByRole('button', { name: /novo usuário/i }))

    const perfil = within(screen.getByRole('dialog')).getByLabelText('Perfil')
    const opcoes = within(perfil).getAllByRole('option').map((o) => o.value)

    expect(opcoes).not.toContain('pesquisador')
    expect(opcoes).toEqual(
      expect.arrayContaining(['supervisor', 'administrador', 'demandante'])
    )
  })

  it('recusa e-mail invalido sem chamar a API', async () => {
    const user = userEvent.setup()
    await renderUsuarios()

    await user.click(screen.getByRole('button', { name: /novo usuário/i }))

    const dialogo = screen.getByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Nome'), 'Sem E-mail')
    await user.type(within(dialogo).getByLabelText('E-mail'), 'nao-e-um-email')
    await user.click(within(dialogo).getByRole('button', { name: /criar conta e enviar convite/i }))

    expect(within(dialogo).getByRole('alert')).toHaveTextContent('E-mail inválido.')
    expect(api.createUsuario).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('mostra o erro que a API devolveu e mantem o formulario aberto', async () => {
    const user = userEvent.setup()
    api.createUsuario.mockRejectedValue(
      new Error('usuario com este email já existe.')
    )
    await renderUsuarios()

    await user.click(screen.getByRole('button', { name: /novo usuário/i }))

    const dialogo = screen.getByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Nome'), 'Repetida')
    await user.type(within(dialogo).getByLabelText('E-mail'), 'maria.ferreira@ac2microbiologia.com.br')
    await user.click(within(dialogo).getByRole('button', { name: /criar conta e enviar convite/i }))

    expect(await screen.findByText('usuario com este email já existe.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('UsersSection — situação do acesso', () => {
  it('inativa apenas depois da confirmacao, e nao oferece exclusao', async () => {
    const user = userEvent.setup()
    api.setSituacaoUsuario.mockResolvedValue({
      ...comoApi(USUARIOS_EXEMPLO.find((u) => u.nome === 'Maria Ferreira')),
      situacao: 'inativo',
    })
    await renderUsuarios()

    const linha = linhaDe('Maria Ferreira')
    await user.click(within(linha).getByRole('button', { name: /ações para maria ferreira/i }))

    expect(screen.queryByRole('menuitem', { name: /excluir/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: /inativar acesso/i }))

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent(/perde o acesso na próxima requisição/i)
    expect(api.setSituacaoUsuario).not.toHaveBeenCalled()

    await user.click(within(dialogo).getByRole('button', { name: /^inativar$/i }))

    expect(api.setSituacaoUsuario).toHaveBeenCalledWith(2, 'inativo')
    expect(within(linhaDe('Maria Ferreira')).getByText('Inativo')).toBeInTheDocument()
  })

  it('oferece suspender para conta ativa e ativar para conta inativa', async () => {
    const user = userEvent.setup()
    await renderUsuarios()

    const ativa = linhaDe('Maria Ferreira')
    await user.click(within(ativa).getByRole('button', { name: /ações para maria ferreira/i }))
    expect(screen.getByRole('menuitem', { name: /suspender acesso/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^ativar acesso$/i })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    const inativa = linhaDe('João Batista')
    await user.click(within(inativa).getByRole('button', { name: /ações para joão batista/i }))
    expect(screen.getByRole('menuitem', { name: /ativar acesso/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /inativar acesso/i })).not.toBeInTheDocument()
  })
})

describe('UsersSection — convite', () => {
  it('so oferece reenviar convite a quem ainda nao definiu senha', async () => {
    const user = userEvent.setup()
    api.listUsuarios.mockResolvedValue({
      results: [
        { ...comoApi(USUARIOS_EXEMPLO[1]), aguardando_primeiro_acesso: true },
        { ...comoApi(USUARIOS_EXEMPLO[7]), aguardando_primeiro_acesso: false },
      ],
    })
    await renderUsuarios()

    const pendente = linhaDe('Maria Ferreira')
    expect(within(pendente).getByText('Aguardando primeiro acesso')).toBeInTheDocument()
    await user.click(within(pendente).getByRole('button', { name: /ações para maria ferreira/i }))
    expect(screen.getByRole('menuitem', { name: /reenviar convite/i })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    const jaEntrou = linhaDe('Rafael Antunes')
    await user.click(within(jaEntrou).getByRole('button', { name: /ações para rafael antunes/i }))
    expect(screen.queryByRole('menuitem', { name: /reenviar convite/i })).not.toBeInTheDocument()
  })

  it('reenvia o convite pela API', async () => {
    const user = userEvent.setup()
    api.reenviarConvite.mockResolvedValue({ detail: 'Convite reenviado.' })
    api.listUsuarios.mockResolvedValue({
      results: [{ ...comoApi(USUARIOS_EXEMPLO[1]), aguardando_primeiro_acesso: true }],
    })
    await renderUsuarios()

    const linha = linhaDe('Maria Ferreira')
    await user.click(within(linha).getByRole('button', { name: /ações para maria ferreira/i }))
    await user.click(screen.getByRole('menuitem', { name: /reenviar convite/i }))

    expect(api.reenviarConvite).toHaveBeenCalledWith(2)
    expect(
      await screen.findByText(/novo convite enviado para maria\.ferreira@/i)
    ).toBeInTheDocument()
  })
})

describe('usersData', () => {
  it('monta as iniciais a partir do primeiro e do último nome', () => {
    expect(iniciais('Maria Ferreira')).toBe('MF')
    expect(iniciais('João Batista')).toBe('JB')
    expect(iniciais('Agroindústria Vale Verde')).toBe('AV')
    expect(iniciais('Cooperativa')).toBe('CO')
  })

  it('descreve o último acesso em linguagem relativa', () => {
    const referencia = new Date('2026-09-03T15:00:00').getTime()
    const hoje = new Date('2026-09-03T09:21:00').getTime()
    const ontem = new Date('2026-09-02T18:02:00').getTime()
    const tresDias = new Date('2026-08-31T10:00:00').getTime()
    const antigo = new Date('2026-03-12T10:00:00').getTime()

    expect(formatarUltimoAcesso(hoje, referencia)).toBe('Hoje às 09:21')
    expect(formatarUltimoAcesso(ontem, referencia)).toBe('Ontem às 18:02')
    expect(formatarUltimoAcesso(tresDias, referencia)).toBe('Há 3 dias')
    expect(formatarUltimoAcesso(antigo, referencia)).toBe('12/03/2026')
    expect(formatarUltimoAcesso(null, referencia)).toBe('Nunca acessou')
  })

  it('escapa aspas ao montar o CSV', () => {
    const csv = usuariosParaCsv([
      {
        nome: 'Empresa "Alfa"',
        email: 'a@b.com',
        perfil: 'demandante',
        status: 'ativo',
        instituicao: 'Alfa',
        ultimoAcesso: Date.now(),
      },
    ])

    expect(csv).toContain('"Empresa ""Alfa"""')
    expect(csv.split('\r\n')).toHaveLength(2)
  })
})
