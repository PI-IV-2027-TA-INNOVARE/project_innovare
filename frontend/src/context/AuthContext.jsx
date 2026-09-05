import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  clearApiAuthSession,
  configureApiAuth,
  getApiAuthSession,
  setApiAuthSession,
} from '../lib/api'
import { getAuthenticatedProfile, requestAuthToken } from '../services/pdConnectApi'
import {
  IS_MOCK_AUTH_ENABLED,
  mockRestoreSession,
  mockSignIn,
  mockSignOut,
} from '../services/mockAuth'
import { ROLES, roleLabel } from '../lib/roles'

/**
 * Sessao autenticada do P&D Connect.
 *
 * Dois caminhos possiveis:
 *  - real: JWT via `/api/auth/token/`, hidratado por `/api/auth/profile/`;
 *  - demonstracao: usuarios ficticios, quando `VITE_AUTH_MOCK=true` (ver
 *    `services/mockAuth.js`). Serve para navegar no front sem backend.
 *
 * Nao existe autocadastro: pesquisadores sao cadastrados por um Supervisor e as
 * demais contas provisionadas pelo Administrador (RN-A04 / D06).
 */

const STORAGE_KEY = 'pdconnect-auth-session-v2'

const AuthContext = createContext(null)

/**
 * Traduz o tipo de usuario do backend atual para os papeis da baseline.
 * O backend so conhece `pesquisador` e `empresa`; Supervisor e Administrador
 * chegam na Fase 2 do plano.
 */
function resolveRole(profilePayload) {
  if (profilePayload?.pesquisador) return ROLES.PESQUISADOR
  if (profilePayload?.empresa) return ROLES.DEMANDANTE

  return null
}

function normalizeStoredSession(session) {
  if (!session) return null

  const accessToken = session.accessToken?.trim() || ''
  const refreshToken = session.refreshToken?.trim() || ''

  if (!accessToken && !refreshToken) return null

  return { accessToken, refreshToken }
}

function readStoredSession() {
  try {
    const rawSession = window.localStorage.getItem(STORAGE_KEY)
    return rawSession ? normalizeStoredSession(JSON.parse(rawSession)) : null
  } catch {
    return null
  }
}

function persistSession(session) {
  const normalizedSession = normalizeStoredSession(session)

  if (!normalizedSession) {
    window.localStorage.removeItem(STORAGE_KEY)
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedSession))
}

function translateApiMessage(message) {
  if (!message) return ''

  if (message.includes('No active account found with the given credentials')) {
    return 'E-mail ou senha invalidos.'
  }

  if (message.includes('token_not_valid')) {
    return 'Sua sessao expirou. Faca login novamente.'
  }

  return message
}

function buildFriendlyErrorMessage(error, fallback) {
  if (!error?.message) return fallback

  return translateApiMessage(error.message) || fallback
}

/** Monta o usuario da aplicacao a partir do payload de `/api/auth/profile/`. */
function buildUser(profilePayload) {
  const role = resolveRole(profilePayload)

  if (!role) {
    throw new Error('A API autenticada nao retornou um perfil reconhecido.')
  }

  const profile = profilePayload.pesquisador || profilePayload.empresa

  return {
    idUser: profilePayload.id_user,
    email: profilePayload.email,
    role,
    roleLabel: roleLabel(role),
    displayName:
      profile?.name ||
      profile?.razao_social ||
      profile?.legal_name ||
      profilePayload.email,
    profileId: profile?.id_researcher ?? profile?.id_company ?? null,
    isMock: false,
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
    window.localStorage.removeItem(STORAGE_KEY)
  }

  const hydrateSession = async (nextSession, { persist = true } = {}) => {
    const normalizedSession = normalizeStoredSession(nextSession)

    if (!normalizedSession) {
      clearAuthState('')
      setIsBootstrapping(false)
      return { ok: false, message: 'Sessao invalida. Faca login novamente.' }
    }

    setIsBootstrapping(true)
    setAuthError('')
    setApiAuthSession(normalizedSession)

    try {
      const nextUser = buildUser(await getAuthenticatedProfile())
      const resolvedSession = normalizeStoredSession(getApiAuthSession()) || normalizedSession

      setSession(resolvedSession)
      setUser(nextUser)

      if (persist) persistSession(resolvedSession)

      return { ok: true, user: nextUser }
    } catch (error) {
      const message = buildFriendlyErrorMessage(
        error,
        'Nao foi possivel restaurar a sessao autenticada.'
      )

      clearAuthState(message)
      return { ok: false, message }
    } finally {
      setIsBootstrapping(false)
    }
  }

  // --- Bootstrap -----------------------------------------------------------
  useEffect(() => {
    if (IS_MOCK_AUTH_ENABLED) {
      mockRestoreSession()
        .then((restoredUser) => { if (restoredUser) setUser(restoredUser) })
        .finally(() => setIsBootstrapping(false))

      return undefined
    }

    configureApiAuth({
      onUnauthorized: () => {
        clearAuthState('Sua sessao expirou. Faca login novamente.')
        setIsBootstrapping(false)
      },
      onSessionRefresh: (nextSession) => {
        const normalizedSession = normalizeStoredSession(nextSession)

        if (!normalizedSession) return

        setSession(normalizedSession)
        persistSession(normalizedSession)
      },
    })

    const storedSession = readStoredSession()

    if (!storedSession) {
      setIsBootstrapping(false)
      return () => { configureApiAuth() }
    }

    setSession(storedSession)
    hydrateSession(storedSession, { persist: false })

    return () => { configureApiAuth() }
  }, [])

  // --- Acoes ---------------------------------------------------------------

  const signInWithCredentials = async ({ email, password }) => {
    if (IS_MOCK_AUTH_ENABLED) {
      const result = await mockSignIn({ email, password })

      if (result.ok) {
        setUser(result.user)
        setAuthError('')
      }

      return result
    }

    try {
      const tokenPayload = await requestAuthToken({ email: email.trim(), password })

      return hydrateSession({
        accessToken: tokenPayload?.access || '',
        refreshToken: tokenPayload?.refresh || '',
      })
    } catch (error) {
      return {
        ok: false,
        message: buildFriendlyErrorMessage(
          error,
          'Nao foi possivel autenticar com as credenciais informadas.'
        ),
      }
    }
  }

  const refreshUser = async () => {
    if (IS_MOCK_AUTH_ENABLED) return { ok: true, user }

    if (!session) {
      return { ok: false, message: 'Nao existe sessao ativa para atualizar.' }
    }

    return hydrateSession(session)
  }

  const logout = () => {
    if (IS_MOCK_AUTH_ENABLED) mockSignOut()

    clearAuthState('')
    setIsBootstrapping(false)
  }

  const value = useMemo(() => ({
    user,
    session,
    isAuthenticated: Boolean(user),
    isBootstrapping,
    authError,
    isMockAuth: IS_MOCK_AUTH_ENABLED,
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
