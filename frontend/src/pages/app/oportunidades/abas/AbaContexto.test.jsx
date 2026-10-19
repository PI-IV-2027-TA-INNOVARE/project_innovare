import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AbaContexto from './AbaContexto'

const BASE = {
  origem: 'externo',
  resumo: 'Contaminação recorrente em lote de bioinsumo.',
  demandante: 'Agroindústria Vale Verde',
  responsavel: 'Rafael Antunes',
  criadaEm: Date.parse('2026-09-01T10:00:00.000Z'),
  competencias: [],
  lacunas: [],
  equipe: [],
}

function renderizar(extra = {}) {
  return render(<AbaContexto oportunidade={{ ...BASE, ...extra }} />)
}

const linha = (rotulo) =>
  screen.getByText(rotulo, { selector: 'dt' }).nextElementSibling

describe('AbaContexto — a entrada', () => {
  it('mostra o relato que originou a oportunidade', () => {
    renderizar()

    expect(screen.getByText(BASE.resumo)).toBeInTheDocument()
  })

  it('traduz a origem para o vocabulário do cliente', () => {
    renderizar()

    expect(linha('Origem')).toHaveTextContent('Problema externo')
  })

  it('a ideia interna aparece com o próprio rótulo', () => {
    renderizar({ origem: 'interna' })

    expect(linha('Origem')).toHaveTextContent('Ideia interna')
  })

  it('identifica o demandante e quem conduz', () => {
    renderizar()

    expect(linha('Demandante')).toHaveTextContent('Agroindústria Vale Verde')
    expect(linha('Responsável')).toHaveTextContent('Rafael Antunes')
  })
})

describe('AbaContexto — como conduzir', () => {
  /**
   * O cartão "O que já se sabe" lia `competencias` e `equipe` de `daApi`, que
   * os devolve sempre vazios: depois de derivar e rodar o matching ele seguia
   * dizendo "ainda não derivadas". No lugar entra o roteiro das etapas, que
   * responde a pergunta que o Supervisor faz ao abrir a oportunidade: por
   * onde começo.
   */
  it('lista as etapas na ordem em que o fluxo as usa', () => {
    renderizar()

    const titulos = screen
      .getAllByText(/./, { selector: '.roteiro__titulo' })
      .map((item) => item.textContent)

    expect(titulos).toEqual([
      'Copiloto',
      'Proposta estruturada',
      'Competências',
      'Equipe potencial',
      'Pré-análise',
      'Decisão',
    ])
  })

  it('leva o Supervisor direto à etapa escolhida', async () => {
    const irPara = vi.fn()
    render(<AbaContexto oportunidade={BASE} podeConduzir irPara={irPara} />)

    await userEvent.click(screen.getByRole('button', { name: /abrir a etapa copiloto/i }))

    expect(irPara).toHaveBeenCalledWith('copiloto')
  })

  it('não promete conteúdo que a tela não recebe', () => {
    renderizar()

    expect(screen.queryByText(/ainda não derivadas/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/matching ainda não executado/i)).not.toBeInTheDocument()
  })
})
