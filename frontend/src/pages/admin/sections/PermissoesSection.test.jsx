import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PermissoesSection from './PermissoesSection'

describe('PermissoesSection', () => {
  it('mostra a matriz macro com os quatro perfis', () => {
    render(<PermissoesSection />)

    const tabela = screen.getByRole('table', {
      name: /quem pode fazer o quê na plataforma/i,
    })

    expect(
      within(tabela).getByRole('columnheader', { name: 'Demandante Externo' })
    ).toBeInTheDocument()
    expect(
      within(tabela).getByRole('columnheader', { name: 'Pesquisador' })
    ).toBeInTheDocument()
    expect(
      within(tabela).getByRole('columnheader', { name: 'Supervisor' })
    ).toBeInTheDocument()
    expect(
      within(tabela).getByRole('columnheader', { name: 'Administrador' })
    ).toBeInTheDocument()
  })

  it('cruza cada ação com o papel responsável', () => {
    render(<PermissoesSection />)

    const linha = screen.getByRole('row', {
      name: /cadastrar problema externo/i,
    })
    const celulas = within(linha).getAllByRole('cell')

    expect(celulas.map((celula) => celula.textContent)).toEqual([
      'Sim',
      'Não',
      'Acompanha',
      'Não',
    ])

    const decisao = screen.getByRole('row', {
      name: /decidir continuidade, revisão ou arquivamento/i,
    })

    expect(within(decisao).getAllByRole('cell')[2]).toHaveTextContent('Sim')
    expect(within(decisao).getAllByRole('cell')[3]).toHaveTextContent('Não')
  })

  it('explica que o Demandante acompanha as oportunidades da empresa dele (PB22)', () => {
    render(<PermissoesSection />)

    expect(
      screen.getByText('As oportunidades da própria empresa, mesmo as cadastradas por outro Demandante dela.')
    ).toBeInTheDocument()
    expect(screen.queryByText(/somente as oportunidades que cadastrou/i)).not.toBeInTheDocument()
  })

  it('o Administrador gerencia contas e acessos, e não permissões (PB04, opção A)', () => {
    render(<PermissoesSection />)

    const linha = screen.getByRole('row', { name: /gerenciar contas e acessos/i })

    expect(within(linha).getAllByRole('cell')[3]).toHaveTextContent('Sim')
    expect(screen.queryByRole('row', { name: /permissões/i })).not.toBeInTheDocument()
  })

  it('o subtítulo fala a língua de quem administra, sem jargão do projeto', () => {
    render(<PermissoesSection />)

    expect(screen.getByText(/^O que cada perfil pode fazer na plataforma\./)).toBeInTheDocument()
    expect(screen.queryByText(/matriz macro/i)).not.toBeInTheDocument()
  })

  it('a falta de autocadastro vira nota, e não uma linha que ninguém faz', () => {
    render(<PermissoesSection />)

    expect(screen.queryByRole('row', { name: /autocadastro/i })).not.toBeInTheDocument()
    expect(
      screen.getByText('O Pesquisador não tem autocadastro: a conta dele nasce do cadastro feito pelo Supervisor.')
    ).toBeInTheDocument()
  })

  it('avisa que a tabela rola para o lado quando a tela é estreita', () => {
    render(<PermissoesSection />)

    expect(screen.getByText('Deslize a tabela para o lado para ver os quatro perfis.')).toBeInTheDocument()
  })

  it('cada termo da legenda usa o mesmo selo que aparece na tabela', () => {
    const { container } = render(<PermissoesSection />)
    const tabela = screen.getByRole('table')

    const selos = [...container.querySelectorAll('.permissoes__notas dt .permissoes__valor')]

    expect(selos.map((selo) => selo.textContent)).toEqual(['Acompanha', 'Próprias', 'Administrativo'])

    for (const selo of selos) {
      expect(selo.className).toBe(within(tabela).getByText(selo.textContent).className)
    }
  })

  it('quem usa teclado alcança a área que rola a tabela', () => {
    render(<PermissoesSection />)

    const area = screen.getByRole('region', { name: 'Tabela de permissões' })

    expect(area).toHaveAttribute('tabindex', '0')
    expect(within(area).getByRole('table')).toBeInTheDocument()
  })

  it('deixa claro que a tela é somente leitura', () => {
    render(<PermissoesSection />)

    expect(screen.getByRole('note')).toHaveTextContent(/somente leitura/i)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
