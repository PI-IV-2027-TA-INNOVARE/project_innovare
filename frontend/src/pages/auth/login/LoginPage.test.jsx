import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../../context/ThemeContext'
import LoginPage from './LoginPage'

/**
 * O AuthContext e dublado: estes testes descrevem a TELA de login — validacao,
 * foco, estado de erro e acessibilidade. A sessao real (JWT, hidratacao de
 * perfil, refresh) e responsabilidade do AuthContext e merece arquivo proprio.
 */
const auth = {
  authError: '',
  isAuthenticated: false,
  signInWithCredentials: vi.fn(),
}

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <ThemeProvider>
        <LoginPage />
      </ThemeProvider>
    </MemoryRouter>
  )
}

/**
 * O `fireEvent` monta o KeyboardEvent pelo construtor nativo, que descarta
 * `getModifierState` vindo no init. O SyntheticEvent do React delega a leitura
 * ao evento nativo, entao a funcao precisa ser posta na instancia.
 */
function teclar(elemento, tipo, { capsLock }) {
  const evento = new KeyboardEvent(tipo, { key: 'a', bubbles: true, cancelable: true })
  evento.getModifierState = () => capsLock
  fireEvent(elemento, evento)
}

const campoEmail = () => screen.getByLabelText('E-mail')
const campoSenha = () => screen.getByLabelText('Senha')
const botaoEntrar = () => screen.getByRole('button', { name: /^entrar$/i })

beforeEach(() => {
  auth.authError = ''
  auth.isAuthenticated = false
  auth.signInWithCredentials = vi.fn().mockResolvedValue({ ok: true })
})

describe('LoginPage — estrutura e acessibilidade', () => {
  it('expoe um unico h1 e ele e a acao da tela, nao a marca', () => {
    renderLogin()

    const titulos = screen.getAllByRole('heading', { level: 1 })

    expect(titulos).toHaveLength(1)
    expect(titulos[0]).toHaveTextContent('Entrar')
  })

  it('associa rotulo a cada campo e marca os dois como obrigatorios', () => {
    renderLogin()

    expect(campoEmail()).toBeRequired()
    expect(campoSenha()).toBeRequired()
    expect(campoEmail()).toHaveAttribute('autocomplete', 'email')
    expect(campoSenha()).toHaveAttribute('autocomplete', 'current-password')
  })

  it('poe o foco no e-mail ao abrir — a tela existe para digitar credencial', () => {
    renderLogin()

    expect(campoEmail()).toHaveFocus()
  })
})

describe('LoginPage — validacao no cliente', () => {
  it('sem e-mail: alerta, campo invalido e foco no campo a corrigir', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(botaoEntrar())

    const alerta = screen.getByRole('alert')

    expect(alerta).toHaveTextContent('Informe seu e-mail para continuar.')
    expect(campoEmail()).toHaveAttribute('aria-invalid', 'true')
    expect(campoEmail()).toHaveFocus()
    expect(auth.signInWithCredentials).not.toHaveBeenCalled()
  })

  it('sem senha: o foco vai para a senha, nao para o e-mail', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(campoEmail(), 'supervisor@ac2microbiologia.com.br')
    await user.click(botaoEntrar())

    expect(screen.getByRole('alert')).toHaveTextContent('Informe sua senha para continuar.')
    expect(campoSenha()).toHaveAttribute('aria-invalid', 'true')
    expect(campoSenha()).toHaveFocus()
  })

  it('liga o campo invalido ao alerta por aria-describedby (WCAG 3.3.1)', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(botaoEntrar())

    const alerta = screen.getByRole('alert')

    expect(alerta).toHaveAttribute('id')
    expect(campoEmail().getAttribute('aria-describedby')).toContain(alerta.id)
  })

  it('limpa o erro assim que o usuario corrige o campo', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(botaoEntrar())
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.type(campoEmail(), 'a')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(campoEmail()).not.toHaveAttribute('aria-invalid')
  })
})

describe('LoginPage — envio', () => {
  it('envia as credenciais digitadas quando o formulario esta valido', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(campoEmail(), 'supervisor@ac2microbiologia.com.br')
    await user.type(campoSenha(), 'supervisor123')
    await user.click(botaoEntrar())

    expect(auth.signInWithCredentials).toHaveBeenCalledWith({
      email: 'supervisor@ac2microbiologia.com.br',
      password: 'supervisor123',
    })
  })

  it('credencial recusada: marca os dois campos e leva o foco ao alerta', async () => {
    const user = userEvent.setup()
    auth.signInWithCredentials = vi.fn().mockResolvedValue({
      ok: false,
      message: 'E-mail ou senha inválidos.',
    })
    renderLogin()

    await user.type(campoEmail(), 'supervisor@ac2microbiologia.com.br')
    await user.type(campoSenha(), 'senha-errada')
    await user.click(botaoEntrar())

    const alerta = await screen.findByRole('alert')

    expect(alerta).toHaveTextContent('E-mail ou senha inválidos.')
    // O backend nao diz qual dos dois falhou: os dois ficam marcados.
    expect(campoEmail()).toHaveAttribute('aria-invalid', 'true')
    expect(campoSenha()).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(alerta).toHaveFocus())
  })

  it('durante o envio: botao desabilitado e formulario com aria-busy', async () => {
    const user = userEvent.setup()
    let liberar
    auth.signInWithCredentials = vi.fn(
      () => new Promise((resolve) => { liberar = () => resolve({ ok: true }) })
    )
    renderLogin()

    await user.type(campoEmail(), 'supervisor@ac2microbiologia.com.br')
    await user.type(campoSenha(), 'supervisor123')
    await user.click(botaoEntrar())

    const enviando = screen.getByRole('button', { name: /entrando/i })

    expect(enviando).toBeDisabled()
    expect(campoEmail()).toBeDisabled()
    expect(document.querySelector('form')).toHaveAttribute('aria-busy', 'true')

    liberar()
    await waitFor(() => expect(screen.getByRole('button', { name: /^entrar$/i })).toBeEnabled())
  })
})

describe('LoginPage — campo de senha', () => {
  it('alterna visibilidade e reflete o estado em aria-pressed', async () => {
    const user = userEvent.setup()
    renderLogin()

    const alternar = screen.getByRole('button', { name: 'Mostrar senha' })

    expect(campoSenha()).toHaveAttribute('type', 'password')
    expect(alternar).toHaveAttribute('aria-pressed', 'false')

    await user.click(alternar)

    expect(campoSenha()).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar senha' }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('avisa quando o Caps Lock esta ativo e liga o aviso ao campo', () => {
    renderLogin()

    teclar(campoSenha(), 'keydown', { capsLock: true })

    const aviso = screen.getByText(/caps lock/i)

    expect(aviso).toBeInTheDocument()
    expect(campoSenha().getAttribute('aria-describedby')).toContain(aviso.id)
  })

  it('esconde o aviso de Caps Lock quando ele e desligado', () => {
    renderLogin()

    teclar(campoSenha(), 'keydown', { capsLock: true })
    expect(screen.getByText(/caps lock/i)).toBeInTheDocument()

    teclar(campoSenha(), 'keyup', { capsLock: false })
    expect(screen.queryByText(/caps lock/i)).not.toBeInTheDocument()
  })
})

describe('LoginPage — canal unico de erro', () => {
  it('mostra a sessao encerrada vinda do contexto', () => {
    auth.authError = 'Sua sessão expirou. Faça login novamente.'
    renderLogin()

    const alerta = screen.getByRole('alert')

    expect(alerta).toHaveTextContent('Sessão encerrada')
    expect(alerta).toHaveTextContent('Sua sessão expirou. Faça login novamente.')
  })

  it('o erro do envio tem precedencia sobre a sessao encerrada', async () => {
    const user = userEvent.setup()
    auth.authError = 'Sua sessão expirou. Faça login novamente.'
    renderLogin()

    await user.click(botaoEntrar())

    const alertas = screen.getAllByRole('alert')

    expect(alertas).toHaveLength(1)
    expect(alertas[0]).toHaveTextContent('Não foi possível entrar')
  })
})

describe('LoginPage — modo demonstracao desligado', () => {
  it('nao vaza credencial de vitrine quando VITE_AUTH_MOCK e false', () => {
    renderLogin()

    expect(screen.queryByText(/modo demonstração/i)).not.toBeInTheDocument()
  })
})
