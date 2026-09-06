import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../../../services/pdConnectApi'
import './ForgotPasswordPage.scss'

function stripFieldPrefix(message) {
  return String(message || '').replace(/^[\w_]+:\s*/i, '')
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [sent, setSent] = useState(false)

  const handleChange = (value) => {
    setEmail(value)
    setErrorMessage('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!email.trim()) {
      setErrorMessage('Informe seu e-mail para continuar.')
      return
    }

    setLoading(true)
    setErrorMessage('')

    try {
      await forgotPassword({
        email: email.trim(),
        frontend_url: window.location.origin,
      })
      setSent(true)
    } catch (error) {
      setErrorMessage(stripFieldPrefix(error.message) || 'Não foi possível enviar o link. Tente novamente.')
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

        <main className="login-shell__form" aria-label="Recuperação de senha">
          <div className="login-box login-box--wide">
            <div className="login-box__header">
              <h1 className="login-box__title">Esqueci minha senha</h1>
              <p className="login-box__subtitle">
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
              </p>
            </div>

            {sent ? (
              <div className="login-feedback">
                <strong>Link enviado com sucesso!</strong>
                <p>
                  Verifique sua caixa de entrada e siga as instruções para redefinir
                  sua senha. O link é válido por 24 horas.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="login-form">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="forgot-email">
                      E-mail
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      className="form-input"
                      value={email}
                      onChange={(e) => handleChange(e.target.value)}
                      placeholder="voce@empresa.com"
                      autoComplete="email"
                      disabled={loading}
                    />
                  </div>
                </div>

                {errorMessage ? <p className="login-message">{errorMessage}</p> : null}

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? 'Enviando...' : 'Enviar link de redefinição'}
                  </button>
                </div>
              </form>
            )}

            <div className="form-divider">ou</div>

            <div className="form-footer">
              Lembrou a senha?{' '}
              <Link to="/login">Voltar para o login</Link>
            </div>
          </div>
        </main>
      </div>
    </section>
  )
}
