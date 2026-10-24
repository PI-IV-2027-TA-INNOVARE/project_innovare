import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AbaDecisao from './AbaDecisao'

const DECISAO_REGISTRADA = {
  tipo: 'continuar',
  justificativa: 'Proposta madura e equipe potencial validada pelo Núcleo.',
  autor: 'Rafael Antunes',
  em: Date.parse('2026-09-20T13:00:00.000Z'),
}

let onRegistrar

beforeEach(() => {
  onRegistrar = vi.fn()
})

function renderizar(props = {}) {
  return render(
    <AbaDecisao podeDecidir onRegistrar={onRegistrar} {...props} />
  )
}

const justificativa = () => screen.getByLabelText('Justificativa')
const registrar = () => screen.getByRole('button', { name: /registrar decisão/i })

describe('AbaDecisao — quem pode decidir', () => {
  it('oferece os tres encaminhamentos da baseline, e nada mais', () => {
    renderizar()

    const opcoes = screen.getAllByRole('radio')

    expect(opcoes).toHaveLength(3)
    expect(opcoes.map((opcao) => opcao.getAttribute('value')))
      .toEqual(['continuar', 'revisar', 'arquivar'])
  })

  it('nasce sem encaminhamento escolhido, para nao sugerir um desfecho', () => {
    renderizar()

    for (const opcao of screen.getAllByRole('radio')) {
      expect(opcao).not.toBeChecked()
    }
  })

  it('diz que a decisao e humana e que a IA nao decide', () => {
    renderizar()

    expect(screen.getByText(/a plataforma não decide, e a IA/i)).toBeInTheDocument()
  })
})

describe('AbaDecisao — o que o registro exige', () => {
  it('nao registra sem encaminhamento escolhido', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.type(justificativa(), 'Motivo suficientemente longo.')
    await user.click(registrar())

    expect(screen.getByRole('alert')).toHaveTextContent(/escolha o encaminhamento/i)
    expect(onRegistrar).not.toHaveBeenCalled()
  })

  it('nao registra sem justificativa: e o que o historico preserva', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(screen.getByRole('radio', { name: /continuar/i }))
    await user.click(registrar())

    expect(screen.getByRole('alert')).toHaveTextContent(/descreva o motivo/i)
    expect(onRegistrar).not.toHaveBeenCalled()
  })

  it('recusa justificativa curta demais para explicar algo', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(screen.getByRole('radio', { name: /arquivar/i }))
    await user.type(justificativa(), 'nao deu')
    await user.click(registrar())

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(onRegistrar).not.toHaveBeenCalled()
  })

  it('registra o encaminhamento e a justificativa sem espaco sobrando', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(screen.getByRole('radio', { name: /revisar/i }))
    await user.type(justificativa(), '   Faltam resultados esperados.   ')
    await user.click(registrar())

    expect(onRegistrar).toHaveBeenCalledTimes(1)
    expect(onRegistrar).toHaveBeenCalledWith(
      'revisar',
      'Faltam resultados esperados.'
    )
  })

  it('cada um dos tres encaminhamentos chega ao registro com o proprio id', async () => {
    for (const tipo of ['continuar', 'revisar', 'arquivar']) {
      onRegistrar = vi.fn()
      const user = userEvent.setup()
      const { unmount } = renderizar()

      await user.click(screen.getByRole('radio', { name: new RegExp(tipo, 'i') }))
      await user.type(justificativa(), 'Justificativa com tamanho bastante.')
      await user.click(registrar())

      expect(onRegistrar).toHaveBeenCalledWith(tipo, expect.any(String))
      expect(onRegistrar.mock.calls[0][0]).toBe(tipo)

      unmount()
    }
  })

  it('o aviso sai da tela quando a pessoa corrige o campo', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(registrar())
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /continuar/i }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('AbaDecisao — decisao ja registrada', () => {
  it('mostra o desfecho, a justificativa e quem registrou', () => {
    renderizar({ decisao: DECISAO_REGISTRADA })

    expect(screen.getByText('Continuar')).toBeInTheDocument()
    expect(screen.getByText(DECISAO_REGISTRADA.justificativa)).toBeInTheDocument()
    expect(screen.getByText('Rafael Antunes')).toBeInTheDocument()
  })

  it('nao oferece decidir de novo por cima do que ja foi registrado', () => {
    renderizar({ decisao: DECISAO_REGISTRADA })

    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /registrar decisão/i }))
      .not.toBeInTheDocument()
  })

  it('a decisao registrada aparece mesmo para quem nao pode decidir', () => {
    renderizar({ decisao: DECISAO_REGISTRADA, podeDecidir: false })

    expect(screen.getByText(DECISAO_REGISTRADA.justificativa)).toBeInTheDocument()
  })
})

describe('AbaDecisao — quem nao decide', () => {
  it('nao recebe o formulario: decidir e do Supervisor (RN-A05)', () => {
    renderizar({ podeDecidir: false })

    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /registrar decisão/i }))
      .not.toBeInTheDocument()
  })

  it('explica que acompanha o resultado em vez de so esconder a acao', () => {
    renderizar({ podeDecidir: false })

    expect(screen.getByText(/aguardando decisão/i)).toBeInTheDocument()
    expect(screen.getByText(/registrado pelo Supervisor/i)).toBeInTheDocument()
  })
})
