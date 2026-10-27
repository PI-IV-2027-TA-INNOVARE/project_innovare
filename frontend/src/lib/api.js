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

/**
 * A sessão do front é só o token de acesso, e só na memória.
 *
 * O token de renovação fica num cookie que o JavaScript não lê: o navegador o
 * manda para `/auth/token/refresh/` e nenhum script da página o enxerga.
 */
function normalizeAuthSession(session) {
  const accessToken = session?.accessToken?.trim() || ''

  return accessToken ? { accessToken } : null
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
      .filter(([campo]) => campo !== 'codigo')
      .map(([, valor]) => flattenErrorDetail(valor))
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

async function requestTokenRefresh() {
  const response = await enviar(buildUrl(AUTH_REFRESH_PATH), {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: '{}',
  })

  const data = await parseResponse(response)

  if (!response.ok) {
    throw buildApiError(
      response,
      data,
      'Não foi possível renovar a sua sessão.'
    )
  }

  const nextSession = normalizeAuthSession({ accessToken: data?.access })

  if (!nextSession?.accessToken) {
    throw new ApiError('Não foi possível renovar a sua sessão.')
  }

  return nextSession
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = requestTokenRefresh()
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

/**
 * Retoma a sessão pelo cookie, como depois de recarregar a página.
 */
export function renovarSessao() {
  return refreshAccessToken()
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

function nomeDoArquivo(response, padrao) {
  const disposicao = response.headers.get('content-disposition') || ''
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposicao)

  if (utf8) return decodeURIComponent(utf8[1])

  const simples = /filename="?([^";]+)"?/i.exec(disposicao)

  return simples ? simples[1] : padrao
}

/**
 * Baixa um arquivo protegido: o pedido leva a sessão, como qualquer outro.
 *
 * O documento não fica num endereço público; quem chama recebe o conteúdo e o
 * nome com que ele deve ser salvo.
 */
export async function baixarArquivo(path, { nomePadrao = 'documento', retryUnauthorized = true } = {}) {
  const headers = new Headers()

  if (authSession?.accessToken) {
    headers.set('Authorization', `Bearer ${authSession.accessToken}`)
  }

  const response = await enviar(buildUrl(path), { cache: 'no-store', headers })

  if (response.status === 401 && retryUnauthorized && authSession?.accessToken) {
    await refreshAccessToken()
    return baixarArquivo(path, { nomePadrao, retryUnauthorized: false })
  }

  if (!response.ok) {
    const data = await parseResponse(response)
    throw buildApiError(response, data, 'Não foi possível baixar o documento.')
  }

  return { conteudo: await response.blob(), nome: nomeDoArquivo(response, nomePadrao) }
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
    authSession?.accessToken
  ) {
    try {
      await refreshAccessToken()
      return apiRequest(path, {
        ...options,
        retryUnauthorized: false,
      })
    } catch {
      throw new ApiError('Sua sessão expirou. Entre novamente.', {
        status: 401,
        data: respostaEmJson(response) ? data : null,
      })
    }
  }

  if (!response.ok) {
    throw buildApiError(
      response,
      data,
      'Não foi possível concluir a operação. Tente novamente.'
    )
  }

  return data
}
