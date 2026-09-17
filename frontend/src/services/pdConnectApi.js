import { apiRequest } from '../lib/api'

export function requestAuthToken(payload) {
  return apiRequest('/auth/token/', {
    method: 'POST',
    body: payload,
    skipAuth: true,
    skipAuthRefresh: true,
  })
}

export function getAuthenticatedProfile() {
  return apiRequest('/auth/profile/')
}

export function forgotPassword(payload) {
  return apiRequest('/auth/forgot-password/', {
    method: 'POST',
    body: payload,
    skipAuth: true,
    skipAuthRefresh: true,
  })
}

export function resetPassword(payload) {
  return apiRequest('/auth/reset-password/', {
    method: 'POST',
    body: payload,
    skipAuth: true,
    skipAuthRefresh: true,
  })
}

export function listUsuarios(params = {}) {
  const query = new URLSearchParams({ page_size: '100', ...params })

  return apiRequest(`/usuarios/?${query}`)
}

export function createUsuario(payload) {
  return apiRequest('/usuarios/', { method: 'POST', body: payload })
}

export function updateUsuario(id, payload) {
  return apiRequest(`/usuarios/${id}/`, { method: 'PATCH', body: payload })
}

export function setSituacaoUsuario(id, situacao) {
  return apiRequest(`/usuarios/${id}/situacao/`, {
    method: 'POST',
    body: { situacao },
  })
}

export function reenviarConvite(id) {
  return apiRequest(`/usuarios/${id}/reenviar-convite/`, { method: 'POST' })
}

export function encerrarSessao(refresh) {
  return apiRequest('/auth/logout/', {
    method: 'POST',
    body: { refresh },
  })
}

export function listOportunidades(params = {}) {
  const query = new URLSearchParams({ page_size: '100' })

  Object.entries(params).forEach(([chave, valor]) => {
    if (valor) query.set(chave, valor)
  })

  return apiRequest(`/oportunidades/?${query}`)
}
