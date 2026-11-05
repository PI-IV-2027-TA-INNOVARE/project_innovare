import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CampoDeSenha, { RegrasDaSenha } from '../../../components/CampoDeSenha'
import { errosDosCampos, problemaNaConfirmacao, problemaNaNovaSenha } from '../../../lib/senha'
import { resetPassword } from '../../../services/pdConnectApi'
import './ResetPasswordPage.scss'

const defaultForm = {
  newPassword: '',
  confirmPassword: '',
}

const FIELD_IDS = {
  newPassword: 'reset-new-password',
  confirmPassword: 'reset-confirm-password',
}

const API_FIELDS = {
  nova_senha: 'newPassword',
  confirmar_senha: 'confirmPassword',
}

const RULES_ID = 'reset-password-rules'

/**
 * As duas portas para a mesma mecânica.
 *
 * Recuperação e primeiro acesso gravam pelo mesmo endpoint, com um token que
 * só difere na finalidade. O que muda é o que a pessoa precisa ler: quem
 * esqueceu a senha se resolve sozinha pelo formulário público; quem foi
 * cadastrado por um supervisor não tem autoatendimento (RN-A04), e oferecer
 * "solicitar novo link" a mandaria para uma porta que não abre.
 */
const VARIANTES = {
  redefinicao: {
    titulo: 'Redefinir senha',
    subtitulo: 'Escolha uma nova senha para a sua conta P&D Connect.',
    rotuloSenha: 'Nova senha',
    acao: 'Redefinir senha',
    regiao: 'Redefinição de senha',
    sucesso: 'Senha redefinida com sucesso!',
    detalheSucesso:
      'Sua senha foi atualizada. Você já pode entrar com as novas credenciais.',
    tituloSemToken: 'Link inválido',
    detalheSemToken:
      'Este link de redefinição é inválido ou está incompleto. Solicite um novo link pelo formulário de recuperação.',
    saidaSemToken: { to: '/esqueci-minha-senha', texto: 'Solicitar novo link' },
    oferecerLogin: true,
  },
  'primeiro-acesso': {
    titulo: 'Definir senha de acesso',
    subtitulo:
      'Sua conta foi cadastrada por um supervisor da AC2. Escolha a senha que você vai usar para entrar.',
    rotuloSenha: 'Senha de acesso',
    acao: 'Definir senha',
    regiao: 'Primeiro acesso',
    sucesso: 'Senha definida com sucesso!',
    detalheSucesso: 'Sua conta está pronta. Entre com o seu e-mail e a senha que você acabou de escolher.',
    tituloSemToken: 'Convite inválido',
    detalheSemToken:
      'Este convite é inválido ou está incompleto. Peça ao supervisor que cadastrou você para enviar um novo.',
    saidaSemToken: null,
    oferecerLogin: false,
  },
}

function stripFieldPrefix(message) {
  return String(message || '').replace(/^[\w_]+:\s*/i, '')
}

function validateForm(form) {
  return Object.fromEntries(
    Object.entries({
      newPassword: problemaNaNovaSenha(form.newPassword),
      confirmPassword: problemaNaConfirmacao(form.newPassword, form.confirmPassword),
    }).filter(([, message]) => message)
  )
}

function focusFirstInvalid(errors) {
  const first = Object.keys(FIELD_IDS).find((field) => errors[field])

  if (first) document.getElementById(FIELD_IDS[first])?.focus()
}

export default function ResetPasswordPage({ variante = 'redefinicao' }) {
  const copy = VARIANTES[variante] || VARIANTES.redefinicao

  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [done, setDone] = useState(false)

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setErrorMessage('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const validationErrors = validateForm(form)
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors)
      focusFirstInvalid(validationErrors)
      return
    }

    setLoading(true)
    setErrorMessage('')
    setFieldErrors({})

    try {
      await resetPassword({
        token,
        nova_senha: form.newPassword,
        confirmar_senha: form.confirmPassword,
      })
      setDone(true)
    } catch (error) {
      const serverErrors = errosDosCampos(error, API_FIELDS)

      if (Object.keys(serverErrors).length > 0) {
        setFieldErrors(serverErrors)
      } else {
        setErrorMessage(
          stripFieldPrefix(error.message) || 'Não foi possível redefinir a senha. Tente novamente.'
        )
      }
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

        <main className="login-shell__form" aria-label={copy.regiao}>
          <div className="login-box login-box--wide">
            <div className="login-box__header">
              <h1 className="login-box__title">{copy.titulo}</h1>
              <p className="login-box__subtitle">{copy.subtitulo}</p>
            </div>

            {!token ? (
              <>
                <div className="login-feedback login-feedback--error">
                  <strong>{copy.tituloSemToken}</strong>
                  <p>{copy.detalheSemToken}</p>
                </div>
                {copy.saidaSemToken ? (
                  <div className="form-footer">
                    <Link to={copy.saidaSemToken.to}>{copy.saidaSemToken.texto}</Link>
                  </div>
                ) : null}
              </>
            ) : done ? (
              <>
                <div className="login-feedback">
                  <strong>{copy.sucesso}</strong>
                  <p>{copy.detalheSucesso}</p>
                </div>
                <div className="form-actions" style={{ marginTop: '8px' }}>
                  <Link to="/login" className="btn btn-primary" style={{ justifyContent: 'center' }}>
                    Entrar
                  </Link>
                </div>
              </>
            ) : (
              <form onSubmit={handleSubmit} className="login-form">
                <div className="form-row">
                  <CampoDeSenha
                    estilo="acesso"
                    id={FIELD_IDS.newPassword}
                    rotulo={copy.rotuloSenha}
                    valor={form.newPassword}
                    onChange={(value) => handleChange('newPassword', value)}
                    autoComplete="new-password"
                    erro={fieldErrors.newPassword}
                    descricao={RULES_ID}
                    desabilitado={loading}
                  />

                  <RegrasDaSenha id={RULES_ID} />

                  <CampoDeSenha
                    estilo="acesso"
                    id={FIELD_IDS.confirmPassword}
                    rotulo="Confirmar nova senha"
                    valor={form.confirmPassword}
                    onChange={(value) => handleChange('confirmPassword', value)}
                    placeholder="Repita a nova senha"
                    autoComplete="new-password"
                    erro={fieldErrors.confirmPassword}
                    desabilitado={loading}
                  />
                </div>

                {errorMessage ? <p className="login-message">{errorMessage}</p> : null}

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? 'Salvando...' : copy.acao}
                  </button>
                </div>
              </form>
            )}

            {token && !done && copy.oferecerLogin ? (
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
