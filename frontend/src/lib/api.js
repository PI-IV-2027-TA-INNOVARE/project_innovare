const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api'
const AUTH_REFRESH_PATH = '/auth/token/refresh/'

const MENSAGEM_ERRO_DO_SERVIDOR =
  'O servidor encontrou um erro inesperado. Tente novamente em instantes; se continuar, avise o suporte.'
const MENSAGEM_SEM_CONEXAO =
  'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.'

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
    if ('detail' in detail) {
      return flattenErrorDetail(detail.detail)
    }

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

function respostaEmJson(response) {
  return (response.headers.get('content-type') || '').includes('application/json')
}

async function parseResponse(response) {
  if (respostaEmJson(response)) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }

  const text = await response.text()
  return text ? { detail: text } : null
}

/**
 * Corpo de erro que nao e JSON nunca chega a tela.
 *
 * A pagina de debug do Django, o 502 de um proxy ou um HTML qualquer viravam
 * `detail` e apareciam inteiros no banner. Fora do JSON so o status conta: 5xx
 * e erro do servidor, o resto cai na mensagem padrao de quem chamou.
 */
function buildApiError(response, data, fallback) {
  const status = response.status
  const dadosDaApi = respostaEmJson(response) ? data : null
  const padrao = status >= 500 ? MENSAGEM_ERRO_DO_SERVIDOR : fallback

  return new ApiError(
    flattenErrorDetail(dadosDaApi) || padrao,
    { status, data: dadosDaApi }
  )
}

async function enviar(url, init) {
  try {
    return await fetch(url, init)
  } catch (erro) {
    if (erro?.name === 'AbortError') {
      throw erro
    }

    throw new ApiError(MENSAGEM_SEM_CONEXAO, { status: 0 })
  }
}

async function requestTokenRefresh(refreshToken) {
  const response = await enviar(buildUrl(AUTH_REFRESH_PATH), {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh: refreshToken }),
  })

  const data = await parseResponse(response)

  if (!response.ok) {
    throw buildApiError(
      response,
      data,
      'Nao foi possivel renovar a sessao autenticada.'
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

/**
 * `FormData` viaja intacto e sem `Content-Type` nosso.
 *
 * O boundary do multipart é gerado pelo navegador junto com o corpo; definir
 * o cabeçalho à mão manda um `multipart/form-data` sem boundary, e o servidor
 * não consegue separar as partes.
 */
function corpoDaRequisicao(body, enviaArquivo) {
  if (body === undefined) return undefined

  return enviaArquivo ? body : JSON.stringify(body)
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

  const enviaArquivo = typeof FormData !== 'undefined' && body instanceof FormData

  if (body !== undefined && !enviaArquivo && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  const response = await enviar(buildUrl(path), {
    cache: 'no-store',
    ...rest,
    headers: requestHeaders,
    body: corpoDaRequisicao(body, enviaArquivo),
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
        data: respostaEmJson(response) ? data : null,
      })
    }
  }

  if (!response.ok) {
    throw buildApiError(
      response,
      data,
      'Nao foi possivel concluir a requisicao para a API.'
    )
  }

  return data
}
