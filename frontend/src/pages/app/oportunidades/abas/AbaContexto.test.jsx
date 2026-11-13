import { render, screen, within } from '@testing-library/react'
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

function conduzir(extra, irPara = vi.fn()) {
  return render(
    <AbaContexto oportunidade={{ ...BASE, ...extra }} podeConduzir irPara={irPara} />,
  )
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
   * O roteiro listava as seis etapas com um "Abrir" em cada, igual para toda
   * oportunidade. Repetia a barra de etapas e, numa oportunidade aguardando
   * decisão, ainda mandava seguir a partir do Copiloto. Agora o cartão parte
   * da situação: o próximo passo em destaque e, abaixo, só o que vem depois,
   * sem botão, porque cada etapa usa o resultado da anterior.
   */
  it('numa oportunidade nova, o próximo passo é o Copiloto', async () => {
    const irPara = vi.fn()
    conduzir({ situacao: 'entrada' }, irPara)

    expect(screen.getByText('Próximo passo · etapa 2')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /ir para copiloto/i }))

    expect(irPara).toHaveBeenCalledWith('copiloto')
  })

  it('lista só as etapas que vêm depois do próximo passo, na ordem do fluxo', () => {
    conduzir({ situacao: 'entrada' })

    const seguintes = within(screen.getByRole('list', { name: 'Etapas seguintes' }))

    expect(
      seguintes.getAllByText(/./, { selector: '.roteiro__titulo' }).map((item) => item.textContent),
    ).toEqual([
      'Proposta estruturada',
      'Competências',
      'Equipe potencial',
      'Pré-análise',
      'Decisão',
    ])
    expect(seguintes.queryByRole('button')).not.toBeInTheDocument()
  })

  it('aguardando decisão, aponta a Decisão e não lista etapas seguintes', () => {
    conduzir({ situacao: 'aguardando_decisao' })

    expect(screen.getByText('Próximo passo · etapa 7')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ir para decisão/i })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Etapas seguintes' })).not.toBeInTheDocument()
  })

  it('de volta para revisão, leva à proposta estruturada', async () => {
    const irPara = vi.fn()
    conduzir({ situacao: 'revisar' }, irPara)

    expect(screen.getByText(/voltou para revisão/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /ir para proposta estruturada/i }))

    expect(irPara).toHaveBeenCalledWith('proposta')
  })

  it('com decisão registrada, leva à decisão em vez de sugerir uma etapa', async () => {
    const irPara = vi.fn()
    conduzir({ situacao: 'continuar' }, irPara)

    expect(screen.getByText('O caminho pelas etapas terminou.')).toBeInTheDocument()
    expect(screen.getByText('A oportunidade já tem decisão registrada: Continuar.')).toBeInTheDocument()
    expect(screen.queryByText(/próximo passo/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Etapas seguintes' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ver a decisão' }))

    expect(irPara).toHaveBeenCalledWith('decisao')
  })

  it('quem não conduz vê em que etapa a oportunidade está, sem convite para conduzir', () => {
    render(
      <AbaContexto oportunidade={{ ...BASE, situacao: 'matching' }} irPara={vi.fn()} />,
    )

    expect(screen.getByText('A oportunidade está na etapa 5, Equipe potencial.')).toBeInTheDocument()
    expect(screen.queryByText(/próximo passo/i)).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Etapas seguintes' }))
        .getAllByText(/./, { selector: '.roteiro__titulo' })
        .map((item) => item.textContent),
    ).toEqual(['Pré-análise', 'Decisão'])
  })

  /**
   * O cartão "O que já se sabe" lia `competencias` e `equipe` de `daApi`, que
   * os devolve sempre vazios: depois de derivar e rodar o matching ele seguia
   * dizendo "ainda não derivadas". No lugar entrou o cartão de como conduzir,
   * que responde a pergunta que o Supervisor faz ao abrir a oportunidade: por
   * onde sigo.
   */
  it('não promete conteúdo que a tela não recebe', () => {
    renderizar()

    expect(screen.queryByText(/ainda não derivadas/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/matching ainda não executado/i)).not.toBeInTheDocument()
  })
})
