import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../../../services/pdConnectApi'
import './ResetPasswordPage.scss'

const defaultForm = {
  newPassword: '',
  confirmPassword: '',
}

function stripFieldPrefix(message) {
  return String(message || '').replace(/^[\w_]+:\s*/i, '')
}

function validateForm(form) {
  if (!form.newPassword) {
    return 'Informe a nova senha.'
  }

  if (form.newPassword.length < 8) {
    return 'A senha deve ter pelo menos 8 caracteres.'
  }

  if (form.newPassword !== form.confirmPassword) {
    return 'As senhas não coincidem.'
  }

  return ''
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [done, setDone] = useState(false)

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrorMessage('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const validationMessage = validateForm(form)
    if (validationMessage) {
      setErrorMessage(validationMessage)
      return
    }

    setLoading(true)
    setErrorMessage('')

    try {
      await resetPassword({
        token,
        new_password: form.newPassword,
        confirm_password: form.confirmPassword,
      })
      setDone(true)
    } catch (error) {
      setErrorMessage(
        stripFieldPrefix(error.message) || 'Não foi possível redefinir a senha. Tente novamente.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="login-page">
      <div className="login-page__bg">
        <div className="login-page__bg-orb login-page__bg-orb--1" />
        <div className="login-page__bg-orb login-page__bg-orb--2" />
      </div>

      <div className="login-shell">
        <aside className="login-brand-panel" aria-label="Apresentação P&D Connect">
          <div className="login-brand-panel__overlay" />
          <div className="login-brand-panel__content">
            <span className="login-brand-panel__brand">P&amp;D Connect</span>
            <p className="login-brand-panel__tagline">
              Pesquisa aplicada, oportunidades reais e conexões inteligentes.
            </p>
          </div>
        </aside>

        <main className="login-shell__form" aria-label="Redefinição de senha">
          <div className="login-box login-box--wide">
            <div className="login-box__header">
              <h1 className="login-box__title">Redefinir senha</h1>
              <p className="login-box__subtitle">
                Escolha uma nova senha para a sua conta P&amp;D Connect.
              </p>
            </div>

            {!token ? (
              <>
                <div className="login-feedback login-feedback--error">
                  <strong>Link inválido</strong>
                  <p>
                    Este link de redefinição é inválido ou está incompleto.
                    Solicite um novo link pelo formulário de recuperação.
                  </p>
                </div>
                <div className="form-footer">
                  <Link to="/esqueci-minha-senha">Solicitar novo link</Link>
                </div>
              </>
            ) : done ? (
              <>
                <div className="login-feedback">
                  <strong>Senha redefinida com sucesso!</strong>
                  <p>
                    Sua senha foi atualizada. Você já pode entrar com as novas credenciais.
                  </p>
                </div>
                <div className="form-actions" style={{ marginTop: '8px' }}>
                  <Link to="/login" className="btn btn-primary" style={{ justifyContent: 'center' }}>
                    Ir para o login
                  </Link>
                </div>
              </>
            ) : (
              <form onSubmit={handleSubmit} className="login-form">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="reset-new-password">
                      Nova senha
                    </label>
                    <input
                      id="reset-new-password"
                      type="password"
                      className="form-input"
                      value={form.newPassword}
                      onChange={(e) => handleChange('newPassword', e.target.value)}
                      placeholder="Mínimo de 8 caracteres"
                      autoComplete="new-password"
                      disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="reset-confirm-password">
                      Confirmar nova senha
                    </label>
                    <input
                      id="reset-confirm-password"
                      type="password"
                      className="form-input"
                      value={form.confirmPassword}
                      onChange={(e) => handleChange('confirmPassword', e.target.value)}
                      placeholder="Repita a nova senha"
                      autoComplete="new-password"
                      disabled={loading}
                    />
                  </div>
                </div>

                {errorMessage ? <p className="login-message">{errorMessage}</p> : null}

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? 'Salvando...' : 'Redefinir senha'}
                  </button>
                </div>
              </form>
            )}

            {token && !done ? (
              <>
                <div className="form-divider">ou</div>
                <div className="form-footer">
                  Lembrou a senha?{' '}
                  <Link to="/login">Voltar para o login</Link>
                </div>
              </>
            ) : null}
          </div>
        </main>
      </div>
    </section>
  )
}
