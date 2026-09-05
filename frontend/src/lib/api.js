const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api'
const AUTH_REFRESH_PATH = '/auth/token/refresh/'

let authSession = null
let refreshPromise = null
let unauthorizedHandler = null
let sessionRefreshHandler = null

export class ApiError extends Error {
  constructor(message, { status = null, data = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value)
}

function resolveBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  return (configuredUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '')
}

function normalizeAuthSession(session) {
  if (!session) {
    return null
  }

  const accessToken = session.accessToken?.trim() || ''
  const refreshToken = session.refreshToken?.trim() || ''

  if (!accessToken && !refreshToken) {
    return null
  }

  return {
    accessToken,
    refreshToken,
  }
}

function buildUrl(path) {
  if (!path) {
    return resolveBaseUrl()
  }

  if (isAbsoluteUrl(path)) {
    return path
  }

  return `${resolveBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
}

function flattenErrorDetail(detail) {
  if (!detail) {
    return ''
  }

  if (typeof detail === 'string') {
    return detail
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => flattenErrorDetail(item))
      .filter(Boolean)
      .join(' ')
  }

  if (typeof detail === 'object') {
    return Object.entries(detail)
      .map(([field, value]) => {
        const message = flattenErrorDetail(value)
        return message ? `${field}: ${message}` : ''
      })
      .filter(Boolean)
      .join(' ')
  }

  return ''
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text ? { detail: text } : null
}

function buildApiError(data, fallback, status = null) {
  return new ApiError(
    flattenErrorDetail(data) || fallback,
    { status, data }
  )
}

async function requestTokenRefresh(refreshToken) {
  const response = await fetch(buildUrl(AUTH_REFRESH_PATH), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh: refreshToken }),
  })

  const data = await parseResponse(response)

  if (!response.ok) {
    throw buildApiError(
      data,
      'Nao foi possivel renovar a sessao autenticada.',
      response.status
    )
  }

  const nextSession = normalizeAuthSession({
    accessToken: data?.access,
    refreshToken: data?.refresh || refreshToken,
  })

  if (!nextSession?.accessToken) {
    throw new ApiError('A API nao retornou um novo access token durante o refresh.')
  }

  return nextSession
}

async function refreshAccessToken() {
  if (!authSession?.refreshToken) {
    throw new ApiError('Sessao sem refresh token para renovacao.')
  }

  if (!refreshPromise) {
    refreshPromise = requestTokenRefresh(authSession.refreshToken)
      .then((nextSession) => {
        authSession = nextSession
        sessionRefreshHandler?.(nextSession)
        return nextSession
      })
      .catch((error) => {
        authSession = null
        unauthorizedHandler?.(error)
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

export function setApiAuthSession(session) {
  authSession = normalizeAuthSession(session)
}

export function getApiAuthSession() {
  return authSession
}

export function clearApiAuthSession() {
  authSession = null
}

export function configureApiAuth({ onUnauthorized = null, onSessionRefresh = null } = {}) {
  unauthorizedHandler = onUnauthorized
  sessionRefreshHandler = onSessionRefresh
}

export async function apiRequest(path, options = {}) {
  const {
    body,
    headers,
    skipAuth = false,
    skipAuthRefresh = false,
    retryUnauthorized = true,
    ...rest
  } = options

  const requestHeaders = new Headers(headers || {})

  if (!skipAuth && authSession?.accessToken && !requestHeaders.has('Authorization')) {
    requestHeaders.set('Authorization', `Bearer ${authSession.accessToken}`)
  }

  if (body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  const response = await fetch(buildUrl(path), {
    ...rest,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const data = await parseResponse(response)

  if (
    response.status === 401 &&
    !skipAuthRefresh &&
    retryUnauthorized &&
    authSession?.refreshToken
  ) {
    try {
      await refreshAccessToken()
      return apiRequest(path, {
        ...options,
        retryUnauthorized: false,
      })
    } catch {
      throw new ApiError('Sua sessao expirou. Faca login novamente.', {
        status: 401,
        data,
      })
    }
  }

  if (!response.ok) {
    throw buildApiError(
      data,
      'Nao foi possivel concluir a requisicao para a API.',
      response.status
    )
  }

  return data
}
