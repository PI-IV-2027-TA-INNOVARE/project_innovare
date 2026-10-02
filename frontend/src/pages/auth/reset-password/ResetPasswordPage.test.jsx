import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetPassword } from '../../../services/pdConnectApi'
import ResetPasswordPage from './ResetPasswordPage'

vi.mock('../../../services/pdConnectApi', () => ({
  resetPassword: vi.fn(),
}))

function renderizar(rota, elemento) {
  render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/primeiro-acesso" element={elemento} />
        <Route path="/redefinir-senha" element={elemento} />
        <Route path="/login" element={<p>tela de login</p>} />
        <Route path="/esqueci-minha-senha" element={<p>tela de recuperação</p>} />
      </Routes>
    </MemoryRouter>
  )
}

const primeiroAcesso = (rota = '/primeiro-acesso?token=convite-1') =>
  renderizar(rota, <ResetPasswordPage variante="primeiro-acesso" />)

const redefinicao = (rota = '/redefinir-senha?token=recuperacao-1') =>
  renderizar(rota, <ResetPasswordPage />)

async function definirSenha(senha = 'Bioinsumo!2026', confirmacao = senha) {
  const user = userEvent.setup({ delay: null })

  await user.type(screen.getByLabelText(/^nova senha$|^senha de acesso$/i), senha)
  await user.type(screen.getByLabelText(/^confirmar/i), confirmacao)
  await user.click(screen.getByRole('button'))
}

beforeEach(() => {
  resetPassword.mockReset().mockResolvedValue(undefined)
})

describe('Primeiro acesso (RN-A04 / D06)', () => {
  it('fala de definir a primeira senha, não de redefinir', () => {
    primeiroAcesso()

    expect(
      screen.getByRole('heading', { name: /definir senha de acesso/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/redefinir senha/i)).not.toBeInTheDocument()
  })

  it('explica de onde veio o convite', () => {
    primeiroAcesso()

    expect(screen.getByText(/cadastrad[oa] .*supervisor/i)).toBeInTheDocument()
  })

  it('usa o mesmo endpoint da redefinição, com o token do convite', async () => {
    primeiroAcesso()
    await definirSenha()

    expect(resetPassword).toHaveBeenCalledWith({
      token: 'convite-1',
      nova_senha: 'Bioinsumo!2026',
      confirmar_senha: 'Bioinsumo!2026',
    })
  })

  it('confirma que a conta está pronta e oferece o login', async () => {
    primeiroAcesso()
    await definirSenha()

    expect(await screen.findByText(/senha definida/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /entrar/i })).toHaveAttribute(
      'href',
      '/login'
    )
  })

  it('convite sem token manda falar com o supervisor, não pedir nova senha', () => {
    /**
     * Na recuperação a pessoa se resolve sozinha pelo formulário público.
     * No primeiro acesso não há autoatendimento (RN-A04): quem reemite o
     * convite é quem cadastrou.
     */
    primeiroAcesso('/primeiro-acesso')

    expect(screen.getByText('Convite inválido')).toBeInTheDocument()
    expect(screen.getByText(/peça ao supervisor/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /solicitar novo link/i })
    ).not.toBeInTheDocument()
  })

  it('recusa senha curta antes de chamar a API', async () => {
    primeiroAcesso()
    await definirSenha('curta')

    expect(screen.getByText(/pelo menos 8 caracteres/i)).toBeInTheDocument()
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it('recusa confirmação divergente antes de chamar a API', async () => {
    primeiroAcesso()
    await definirSenha('Bioinsumo!2026', 'Bioinsumo!2027')

    expect(screen.getByText(/não coincidem/i)).toBeInTheDocument()
    expect(resetPassword).not.toHaveBeenCalled()
  })
})

describe('Redefinição de senha — a variante padrão segue como era', () => {
  it('mantém o título de redefinir', () => {
    redefinicao()

    expect(
      screen.getByRole('heading', { name: /redefinir senha/i })
    ).toBeInTheDocument()
  })

  it('link quebrado continua oferecendo autoatendimento', () => {
    redefinicao('/redefinir-senha')

    expect(
      screen.getByRole('link', { name: /solicitar novo link/i })
    ).toBeInTheDocument()
  })

  it('grava pelo mesmo endpoint', async () => {
    redefinicao()
    await definirSenha()

    expect(resetPassword).toHaveBeenCalledWith({
      token: 'recuperacao-1',
      nova_senha: 'Bioinsumo!2026',
      confirmar_senha: 'Bioinsumo!2026',
    })
  })
})
