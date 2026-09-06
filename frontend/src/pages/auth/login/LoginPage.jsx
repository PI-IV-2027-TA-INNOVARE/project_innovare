import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import ThemeToggle from '../../../components/ThemeToggle'
import { useAuth } from '../../../context/AuthContext'
import { appIcons } from '../../../lib/icons'
import { IS_MOCK_AUTH_ENABLED, MOCK_CREDENTIAL_HINTS } from '../../../services/mockAuth'
import './LoginPage.scss'

/**
 * Tela de acesso do P&D Connect.
 *
 * Não existe autocadastro: pesquisadores são cadastrados por um Supervisor e
 * as demais contas são provisionadas pelo Administrador (RN-A04 / D06 da
 * baseline de atores). Por isso a tela oferece apenas login e recuperação de
 * senha — não há validação de CNPJ nem de e-mail institucional.
 *
 * Acessibilidade: um único canal de erro (`.login-alert`, `role="alert"`) serve
 * tanto à sessão encerrada quanto à falha de submit; os campos culpados ganham
 * `aria-invalid` + `aria-describedby` apontando para ele, e o foco vai para o
 * campo a corrigir (WCAG 3.3.1 / 3.3.2).
 */

const EMPTY_FORM = { email: '', password: '' }

const DESTAQUES = [
  'Estruturação da proposta com apoio do Copiloto de IA',
  'Matching com a rede interna de pesquisadores da AC2',
  'Pré-análise de maturidade orientada ao PIPE/FAPESP',
]

function resolveReturnPath(pathname) {
  return typeof pathname === 'string' && pathname.trim() ? pathname : '/painel'
}

/** Devolve `null` quando o formulário está válido, ou o campo a corrigir. */
function validate({ email, password }) {
  if (!email.trim()) {
    return { field: 'email', message: 'Informe seu e-mail para continuar.' }
  }

  if (!password) {
    return { field: 'password', message: 'Informe sua senha para continuar.' }
  }

  return null
}

export default function LoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { authError, isAuthenticated, signInWithCredentials } = useAuth()

  const [form, setForm] = useState(EMPTY_FORM)
  const [message, setMessage] = useState('')
  const [invalidField, setInvalidField] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isCapsLockOn, setIsCapsLockOn] = useState(false)
  // Fechado por padrao: o formulario real e o foco da tela, e os atalhos de
  // demonstracao nao podem competir com ele por atencao.
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const alertRef = useRef(null)

  useEffect(() => {
    if (isAuthenticated) {
      navigate(resolveReturnPath(location.state?.from), { replace: true })
    }
  }, [isAuthenticated, location.state, navigate])

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    setMessage('')
    setInvalidField('')
  }

  // `credentials` marca os dois campos: o backend não diz qual dos dois falhou.
  const isFieldInvalid = (field) => invalidField === field || invalidField === 'credentials'

  const handleCapsLock = (event) => {
    if (typeof event.getModifierState !== 'function') return

    setIsCapsLockOn(event.getModifierState('CapsLock'))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const validation = validate(form)

    if (validation) {
      setMessage(validation.message)
      setInvalidField(validation.field)

      const target = validation.field === 'email' ? emailRef : passwordRef
      target.current?.focus()
      return
    }

    setIsSubmitting(true)
    setMessage('')
    setInvalidField('')

    const result = await signInWithCredentials(form)

    if (!result.ok) {
      setMessage(result.message)
      setInvalidField('credentials')
      // O alerta fica logo antes do formulário: dar foco a ele lê o erro e
      // deixa o próximo Tab cair direto no campo de e-mail.
      window.requestAnimationFrame(() => alertRef.current?.focus())
    }

    setIsSubmitting(false)
  }

  const fillDemoAccount = (account) => {
    setForm({ email: account.email, password: account.password })
    setMessage('')
    setInvalidField('')
  }

  // Um alerta só, sempre no mesmo lugar. A falha de submit tem precedência
  // sobre a sessão encerrada porque é a ação mais recente do usuário.
  const alertBanner = message
    ? { title: 'Não foi possível entrar', text: message }
    : authError
      ? { title: 'Sessão encerrada', text: authError }
      : null

  const passwordDescribedBy = [
    isFieldInvalid('password') ? 'login-alert' : null,
    isCapsLockOn ? 'login-password-hint' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="login-page">
      <div className="login-shell">
        <aside className="login-brand" aria-label="P&D Connect — AC2 Microbiologia">
          <div className="login-brand__top">
            <span className="login-brand__mark" aria-hidden="true">AC2</span>
            <span className="login-brand__identity">
              <span className="login-brand__client">AC2 Microbiologia</span>
              <span className="login-brand__kicker">
                Núcleo de Pesquisa e Desenvolvimento
              </span>
            </span>
          </div>

          <div className="login-brand__content">
            {/* Identidade, não título de página: o <h1> da tela é "Entrar". */}
            <p className="login-brand__title">
              P&amp;D <span>Connect</span>
            </p>
            <p className="login-brand__tagline">
              Do problema ou da ideia até a proposta estruturada, com equipe
              potencial e maturidade avaliada.
            </p>

            <ul className="login-brand__list">
              {DESTAQUES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="login-panel" aria-label="Acesso à plataforma">
          <ThemeToggle className="login-panel__theme" />

          <div className="login-panel__inner">
            <header className="login-panel__header">
              <h1 className="login-panel__title">Entrar</h1>
              <p className="login-panel__subtitle">
                Acesse com as credenciais fornecidas pelo Núcleo de P&amp;D.
              </p>
            </header>

            {alertBanner ? (
              <div
                id="login-alert"
                className="login-alert"
                role="alert"
                tabIndex={-1}
                ref={alertRef}
              >
                <strong>{alertBanner.title}</strong>
                <p>{alertBanner.text}</p>
              </div>
            ) : null}

            <form
              onSubmit={handleSubmit}
              className="login-form"
              aria-busy={isSubmitting}
              noValidate
            >
              <div className="login-field">
                <label className="login-field__label" htmlFor="login-email">
                  E-mail
                </label>
                <input
                  id="login-email"
                  ref={emailRef}
                  type="email"
                  className="login-field__input"
                  value={form.email}
                  onChange={handleChange('email')}
                  placeholder="nome@empresa.com.br"
                  autoComplete="email"
                  required
                  autoFocus
                  aria-invalid={isFieldInvalid('email') || undefined}
                  aria-describedby={isFieldInvalid('email') ? 'login-alert' : undefined}
                  disabled={isSubmitting}
                />
              </div>

              <div className="login-field">
                <label className="login-field__label" htmlFor="login-password">
                  Senha
                </label>
                <div className="login-field__control">
                  <input
                    id="login-password"
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    className="login-field__input"
                    value={form.password}
                    onChange={handleChange('password')}
                    onKeyUp={handleCapsLock}
                    onKeyDown={handleCapsLock}
                    onBlur={() => setIsCapsLockOn(false)}
                    placeholder="Sua senha"
                    autoComplete="current-password"
                    required
                    aria-invalid={isFieldInvalid('password') || undefined}
                    aria-describedby={passwordDescribedBy || undefined}
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    className="login-field__toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                    title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    disabled={isSubmitting}
                  >
                    <FontAwesomeIcon
                      icon={showPassword ? appIcons.passwordHide : appIcons.passwordShow}
                    />
                  </button>
                </div>

                {isCapsLockOn ? (
                  <p
                    id="login-password-hint"
                    className="login-field__hint login-field__hint--warning"
                  >
                    <FontAwesomeIcon icon={appIcons.warning} aria-hidden="true" />
                    Caps Lock está ativado.
                  </p>
                ) : null}
              </div>

              <button type="submit" className="login-submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="login-submit__spinner" aria-hidden="true" />
                    Entrando…
                  </>
                ) : (
                  'Entrar'
                )}
              </button>

              <Link className="login-link" to="/esqueci-minha-senha">
                Esqueci minha senha
              </Link>
            </form>

            {IS_MOCK_AUTH_ENABLED ? (
              <div className="login-demo">
                <button
                  type="button"
                  className="login-demo__toggle"
                  aria-expanded={isDemoOpen}
                  aria-controls="login-demo-panel"
                  onClick={() => setIsDemoOpen((open) => !open)}
                >
                  <FontAwesomeIcon
                    icon={appIcons.demo}
                    className="login-demo__icon"
                    aria-hidden="true"
                  />
                  <span className="login-demo__title">
                    Modo demonstração — sem backend
                  </span>
                  <FontAwesomeIcon
                    icon={appIcons.disclosure}
                    className={`login-demo__chevron${isDemoOpen ? ' is-open' : ''}`}
                    aria-hidden="true"
                  />
                </button>

                <div id="login-demo-panel" className="login-demo__panel" hidden={!isDemoOpen}>
                <p className="login-demo__hint">
                  Atalhos de teste — não são tipos de conta. O acesso real é
                  sempre por e-mail e senha.
                </p>

                <ul className="login-demo__list">
                  {MOCK_CREDENTIAL_HINTS.map((account) => (
                    <li key={account.email}>
                      <button
                        type="button"
                        className="login-demo__account"
                        onClick={() => fillDemoAccount(account)}
                        aria-label={`Preencher com a conta de ${account.roleLabel} (${account.email})`}
                      >
                        {account.roleLabel}
                      </button>
                    </li>
                  ))}
                </ul>

                <details className="login-demo__details">
                  <summary className="login-demo__summary">Ver credenciais</summary>
                  <div className="login-demo__table">
                    {MOCK_CREDENTIAL_HINTS.map((account) => (
                      <Fragment key={account.email}>
                        <span className="login-demo__email">{account.email}</span>
                        <code className="login-demo__password">{account.password}</code>
                      </Fragment>
                    ))}
                  </div>
                </details>
                </div>
              </div>
            ) : null}

            <p className="login-note">
              Não há autocadastro: o acesso é concedido pelo Núcleo de P&amp;D da
              AC2 e as credenciais chegam por e-mail.
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
