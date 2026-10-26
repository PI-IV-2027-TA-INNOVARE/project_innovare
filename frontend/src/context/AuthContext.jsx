import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  clearApiAuthSession,
  configureApiAuth,
  getApiAuthSession,
  renovarSessao,
  setApiAuthSession,
} from '../lib/api'
import { encerrarSessao, getAuthenticatedProfile, requestAuthToken } from '../services/pdConnectApi'
import { ROLES, roleLabel } from '../lib/roles'

const MARCA_DE_SESSAO = 'pdconnect-sessao'

const CHAVE_ANTIGA = 'pdconnect-auth-session-v2'

/**
 * O navegador guarda só a marca de que havia sessão, nunca token.
 *
 * A marca evita pedir renovação a quem nunca entrou. O token de acesso fica na
 * memória e o de renovação, no cookie que o JavaScript não lê.
 */
function lerMarca() {
  try {
    return window.localStorage.getItem(MARCA_DE_SESSAO) === '1'
  } catch {
    return false
  }
}

function gravarMarca(ativa) {
  try {
    if (ativa) window.localStorage.setItem(MARCA_DE_SESSAO, '1')
    else window.localStorage.removeItem(MARCA_DE_SESSAO)
  } catch {
    return
  }
}

function apagarTokensAntigos() {
  try {
    window.localStorage.removeItem(CHAVE_ANTIGA)
  } catch {
    return
  }
}

const AuthContext = createContext(null)

const VALID_ROLES = new Set(Object.values(ROLES))

function resolveRole(profilePayload) {
  const role = profilePayload?.papel

  return VALID_ROLES.has(role) ? role : null
}

function normalizeStoredSession(session) {
  const accessToken = session?.accessToken?.trim() || ''

  return accessToken ? { accessToken } : null
}

function translateApiMessage(message) {
  if (!message) return ''

  if (message.includes('No active account found with the given credentials')) {
    return 'E-mail ou senha inválidos.'
  }

  if (message.includes('token_not_valid')) {
    return 'Sua sessão expirou. Entre novamente.'
  }

  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Sem conexão com o servidor. Verifique a rede e tente de novo.'
  }

  return message
}

function buildFriendlyErrorMessage(error, fallback) {
  if (!error?.message) return fallback

  return translateApiMessage(error.message) || fallback
}

function buildUser(profilePayload) {
  const role = resolveRole(profilePayload)

  if (!role) {
    throw new Error('Não foi possível reconhecer o perfil desta conta.')
  }

  return {
    idUser: profilePayload.id_usuario,
    email: profilePayload.email,
    role,
    roleLabel: profilePayload.papel_rotulo || roleLabel(role),
    displayName: profilePayload.nome || profilePayload.email,
    organizacao: profilePayload.organizacao || null,
    telefone: profilePayload.telefone ?? null,
    permissions: profilePayload.permissoes || [],
    lastAccess: profilePayload.ultimo_acesso || null,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [authError, setAuthError] = useState('')

  const clearAuthState = (message = '') => {
    setUser(null)
    setSession(null)
    setAuthError(message)
    clearApiAuthSession()
    gravarMarca(false)
  }

  const hydrateSession = async (nextSession) => {
    const normalizedSession = normalizeStoredSession(nextSession)

    if (!normalizedSession) {
      clearAuthState('')
      setIsBootstrapping(false)
      return { ok: false, message: 'Sessão inválida. Entre novamente.' }
    }

    setIsBootstrapping(true)
    setAuthError('')
    setApiAuthSession(normalizedSession)

    try {
      const nextUser = buildUser(await getAuthenticatedProfile())
      const resolvedSession = normalizeStoredSession(getApiAuthSession()) || normalizedSession

      setSession(resolvedSession)
      setUser(nextUser)
      gravarMarca(true)

      return { ok: true, user: nextUser }
    } catch (error) {
      const message = buildFriendlyErrorMessage(
        error,
        'Não foi possível retomar a sua sessão.'
      )

      clearAuthState(message)
      return { ok: false, message }
    } finally {
      setIsBootstrapping(false)
    }
  }

  useEffect(() => {
    configureApiAuth({
      onUnauthorized: () => {
        clearAuthState('Sua sessão expirou. Entre novamente.')
        setIsBootstrapping(false)
      },
      onSessionRefresh: (nextSession) => {
        const normalizedSession = normalizeStoredSession(nextSession)

        if (!normalizedSession) return

        setSession(normalizedSession)
      },
    })

    apagarTokensAntigos()

    if (!lerMarca()) {
      setIsBootstrapping(false)
      return () => { configureApiAuth() }
    }

    renovarSessao()
      .then((retomada) => hydrateSession(retomada))
      .catch(() => {
        clearAuthState('Sua sessão expirou. Entre novamente.')
        setIsBootstrapping(false)
      })

    return () => { configureApiAuth() }
  }, [])

  const signInWithCredentials = async ({ email, password }) => {
    try {
      const tokenPayload = await requestAuthToken({ email: email.trim(), password })

      return hydrateSession({ accessToken: tokenPayload?.access || '' })
    } catch (error) {
      return {
        ok: false,
        message: buildFriendlyErrorMessage(
          error,
          'Não foi possível entrar com o e-mail e a senha informados.'
        ),
      }
    }
  }

  const refreshUser = async () => {
    if (!session) {
      return { ok: false, message: 'Não há sessão ativa para atualizar.' }
    }

    return hydrateSession(session)
  }

  const revogarSessaoNoServidor = async () => {
    if (!getApiAuthSession()?.accessToken) return

    await encerrarSessao().catch(() => {})
  }

  const logout = async () => {
    await revogarSessaoNoServidor()

    clearAuthState('')
    setIsBootstrapping(false)
  }

  const value = useMemo(() => ({
    user,
    session,
    isAuthenticated: Boolean(user),
    isBootstrapping,
    authError,
    signInWithCredentials,
    refreshUser,
    logout,
  }), [authError, isBootstrapping, session, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }

  return context
}
