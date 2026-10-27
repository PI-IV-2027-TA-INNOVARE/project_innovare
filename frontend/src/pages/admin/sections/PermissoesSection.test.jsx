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

  it('deixa claro que a tela é somente leitura', () => {
    render(<PermissoesSection />)

    expect(screen.getByRole('note')).toHaveTextContent(/somente leitura/i)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
