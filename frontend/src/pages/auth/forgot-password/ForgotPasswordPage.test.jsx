import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ForgotPasswordPage from './ForgotPasswordPage'

const api = vi.hoisted(() => ({ forgotPassword: null }))

vi.mock('../../../services/pdConnectApi', () => ({
  forgotPassword: (...args) => api.forgotPassword(...args),
}))

beforeEach(() => {
  api.forgotPassword = vi.fn().mockResolvedValue({})
})

function renderizar() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>
  )
}

const campoEmail = () => screen.getByLabelText('E-mail')
const enviar = () => screen.getByRole('button', { name: /enviar link/i })

describe('ForgotPasswordPage', () => {
  it('pede o e-mail antes de chamar a API', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(enviar())

    expect(screen.getByText('Informe seu e-mail para continuar.')).toBeInTheDocument()
    expect(api.forgotPassword).not.toHaveBeenCalled()
  })

  it('nao aceita so espaco como e-mail', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.type(campoEmail(), '   ')
    await user.click(enviar())

    expect(api.forgotPassword).not.toHaveBeenCalled()
  })

  it('manda o e-mail sem espaco sobrando e a origem que recebe o retorno', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.type(campoEmail(), '  supervisor@ac2microbiologia.com.br  ')
    await user.click(enviar())

    expect(api.forgotPassword).toHaveBeenCalledWith({
      email: 'supervisor@ac2microbiologia.com.br',
      frontend_url: window.location.origin,
    })
  })

  it('troca o formulario pela confirmacao e diz a validade do link', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.type(campoEmail(), 'supervisor@ac2microbiologia.com.br')
    await user.click(enviar())

    expect(await screen.findByText(/link enviado com sucesso/i)).toBeInTheDocument()
    expect(screen.getByText(/válido por 24 horas/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument()
  })

  it('nao confirma envio quando a API recusa', async () => {
    const user = userEvent.setup()
    api.forgotPassword = vi.fn().mockRejectedValue(new Error('Limite de tentativas.'))

    renderizar()

    await user.type(campoEmail(), 'supervisor@ac2microbiologia.com.br')
    await user.click(enviar())

    expect(await screen.findByText('Limite de tentativas.')).toBeInTheDocument()
    expect(screen.queryByText(/link enviado com sucesso/i)).not.toBeInTheDocument()
    expect(campoEmail()).toBeInTheDocument()
  })

  it('tira o prefixo de campo que a API poe na mensagem', async () => {
    const user = userEvent.setup()
    api.forgotPassword = vi.fn().mockRejectedValue(
      new Error('email: Informe um endereco valido.')
    )

    renderizar()

    await user.type(campoEmail(), 'supervisor@ac2microbiologia.com.br')
    await user.click(enviar())

    expect(await screen.findByText('Informe um endereco valido.')).toBeInTheDocument()
  })

  it('cai numa mensagem propria quando a falha vem sem texto', async () => {
    const user = userEvent.setup()
    api.forgotPassword = vi.fn().mockRejectedValue(new Error(''))

    renderizar()

    await user.type(campoEmail(), 'supervisor@ac2microbiologia.com.br')
    await user.click(enviar())

    expect(await screen.findByText(/não foi possível enviar o link/i)).toBeInTheDocument()
  })

  it('o aviso sai quando a pessoa corrige o campo', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(enviar())
    expect(screen.getByText('Informe seu e-mail para continuar.')).toBeInTheDocument()

    await user.type(campoEmail(), 'a')

    expect(screen.queryByText('Informe seu e-mail para continuar.'))
      .not.toBeInTheDocument()
  })

  it('tranca o campo e o botao durante o envio', async () => {
    const user = userEvent.setup()

    let liberar
    api.forgotPassword = vi.fn(() => new Promise((resolve) => { liberar = resolve }))

    renderizar()

    await user.type(campoEmail(), 'supervisor@ac2microbiologia.com.br')
    await user.click(enviar())

    expect(screen.getByRole('button', { name: /enviando/i })).toBeDisabled()
    expect(campoEmail()).toBeDisabled()

    liberar({})
    expect(await screen.findByText(/link enviado com sucesso/i)).toBeInTheDocument()
  })

  it('oferece a volta para o login, que e o unico caminho de acesso', () => {
    renderizar()

    expect(screen.getByRole('link', { name: /voltar para o login/i }))
      .toHaveAttribute('href', '/login')
  })
})
