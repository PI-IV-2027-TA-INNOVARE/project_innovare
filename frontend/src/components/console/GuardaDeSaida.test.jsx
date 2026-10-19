import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GuardaDeSaida from './GuardaDeSaida'

let acoes

beforeEach(() => {
  acoes = {
    onContinuar: vi.fn(),
    onDescartar: vi.fn(),
    onSair: vi.fn(),
  }
})

function renderizar(props = {}) {
  return render(
    <GuardaDeSaida
      aberto
      titulo="Sair sem cadastrar?"
      nota="O problema externo ainda não foi enviado."
      {...acoes}
      {...props}
    />
  )
}

const botao = (nome) => screen.getByRole('button', { name: nome })

describe('GuardaDeSaida', () => {
  it('fechada, não desenha nada', () => {
    const { container } = renderizar({ aberto: false })

    expect(container).toBeEmptyDOMElement()
  })

  it('aberta, mostra o título e a nota de quem a abriu', () => {
    renderizar()

    expect(screen.getByText('Sair sem cadastrar?')).toBeInTheDocument()
    expect(screen.getByText('O problema externo ainda não foi enviado.'))
      .toBeInTheDocument()
  })

  it('promete que o rascunho fica no navegador e que nada foi enviado', () => {
    renderizar()

    expect(screen.getByText(/fica guardado neste navegador/i)).toBeInTheDocument()
    expect(screen.getByText(/nada é enviado enquanto você não cadastrar/i))
      .toBeInTheDocument()
  })

  it('oferece as três saídas, e nenhuma a mais', () => {
    renderizar()

    expect(botao('Descartar')).toBeInTheDocument()
    expect(botao('Continuar editando')).toBeInTheDocument()
    expect(botao('Sair e guardar')).toBeInTheDocument()
  })

  it('"Continuar editando" devolve a pessoa ao formulário', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(botao('Continuar editando'))

    expect(acoes.onContinuar).toHaveBeenCalledTimes(1)
    expect(acoes.onDescartar).not.toHaveBeenCalled()
    expect(acoes.onSair).not.toHaveBeenCalled()
  })

  it('"Descartar" é o único caminho que joga o rascunho fora', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(botao('Descartar'))

    expect(acoes.onDescartar).toHaveBeenCalledTimes(1)
    expect(acoes.onSair).not.toHaveBeenCalled()
  })

  it('"Sair e guardar" sai sem descartar o que foi digitado', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(botao('Sair e guardar'))

    expect(acoes.onSair).toHaveBeenCalledTimes(1)
    expect(acoes.onDescartar).not.toHaveBeenCalled()
  })

  it('Escape é continuar editando, e nunca descartar', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.keyboard('{Escape}')

    expect(acoes.onContinuar).toHaveBeenCalledTimes(1)
    expect(acoes.onDescartar).not.toHaveBeenCalled()
    expect(acoes.onSair).not.toHaveBeenCalled()
  })

  it('clicar fora também é continuar editando, e não perder o rascunho', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(screen.getByRole('dialog').parentElement)

    expect(acoes.onDescartar).not.toHaveBeenCalled()
    expect(acoes.onSair).not.toHaveBeenCalled()
  })
})
