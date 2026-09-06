import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import UsersSection from './UsersSection'
import { formatarUltimoAcesso, iniciais, usuariosParaCsv } from './users/usersData'

/**
 * Testes da tela de Usuários.
 *
 * A lista é um placeholder local (ver `usersData.js`), então o que se verifica
 * aqui é o comportamento da interface: filtro, ordenação, paginação, ações da
 * linha e os diálogos. Quando a Fase 2 ligar o endpoint, estes testes seguem
 * válidos — muda a origem dos dados, não o contrato da tela.
 */
async function renderUsuarios() {
  const resultado = render(<UsersSection />)

  // A tabela nasce em estado de carregamento (esqueleto) por um instante.
  await screen.findByText('Maria Ferreira', {}, { timeout: 2000 })

  return resultado
}

function linhaDe(nome) {
  return screen.getByText(nome).closest('tr')
}

describe('UsersSection', () => {
  it('mostra o esqueleto antes da lista', async () => {
    render(<UsersSection />)

    expect(document.querySelectorAll('.admin-table__skeleton-row').length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(document.querySelectorAll('.admin-table__skeleton-row')).toHaveLength(0)
    })
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

    await user.click(cabecalho) // já estava em 'nome' asc -> passa a desc

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

  it('cria um usuário pelo formulário e avisa o resultado', async () => {
    const user = userEvent.setup()
    await renderUsuarios()

    await user.click(screen.getByRole('button', { name: /novo usuário/i }))

    const dialogo = screen.getByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Nome'), 'Ana Prado')
    await user.type(within(dialogo).getByLabelText('E-mail'), 'ana.prado@ac2microbiologia.com.br')
    await user.click(within(dialogo).getByRole('button', { name: /criar usuário/i }))

    expect(await screen.findByText('Usuário criado com sucesso.')).toBeInTheDocument()
    expect(screen.getByText('Ana Prado')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('recusa e-mail inválido sem fechar o formulário', async () => {
    const user = userEvent.setup()
    await renderUsuarios()

    await user.click(screen.getByRole('button', { name: /novo usuário/i }))

    const dialogo = screen.getByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Nome'), 'Sem E-mail')
    await user.type(within(dialogo).getByLabelText('E-mail'), 'nao-e-um-email')
    await user.click(within(dialogo).getByRole('button', { name: /criar usuário/i }))

    expect(within(dialogo).getByRole('alert')).toHaveTextContent('E-mail inválido.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('exclui um usuário apenas depois da confirmação', async () => {
    const user = userEvent.setup()
    await renderUsuarios()

    const linha = linhaDe('João Batista')
    await user.click(within(linha).getByRole('button', { name: /ações para joão batista/i }))
    await user.click(screen.getByRole('menuitem', { name: /excluir usuário/i }))

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent(/não pode ser desfeita/i)

    await user.click(within(dialogo).getByRole('button', { name: /excluir usuário/i }))

    expect(await screen.findByText('Usuário removido.')).toBeInTheDocument()
    expect(screen.queryByText('João Batista')).not.toBeInTheDocument()
  })

  it('alterna a situação do acesso pelo menu da linha', async () => {
    const user = userEvent.setup()
    await renderUsuarios()

    const linha = linhaDe('Maria Ferreira')
    expect(within(linha).getByText('Ativo')).toBeInTheDocument()

    await user.click(within(linha).getByRole('button', { name: /ações para maria ferreira/i }))
    await user.click(screen.getByRole('menuitem', { name: /inativar acesso/i }))

    expect(within(linhaDe('Maria Ferreira')).getByText('Inativo')).toBeInTheDocument()
  })

  it('mostra o estado vazio quando nenhum filtro casa', async () => {
    const user = userEvent.setup()
    await renderUsuarios()

    await user.type(screen.getByLabelText(/buscar por nome ou e-mail/i), 'zzzz')

    const vazio = screen.getByText('Nenhum usuário encontrado.').closest('.table-empty')
    expect(vazio).toBeInTheDocument()

    await user.click(within(vazio).getByRole('button', { name: /limpar filtros/i }))

    expect(screen.getByText('Maria Ferreira')).toBeInTheDocument()
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
