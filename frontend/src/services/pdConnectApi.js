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

export function alterarSenha(payload) {
  return apiRequest('/auth/change-password/', { method: 'POST', body: payload })
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

export function carregarTema() {
  return apiRequest('/configuracoes/tema/', { skipAuth: true, skipAuthRefresh: true })
}

export function salvarTema(patch) {
  return apiRequest('/configuracoes/tema/', { method: 'PATCH', body: patch })
}

export function listOportunidades(params = {}) {
  const query = new URLSearchParams({ page_size: '100' })

  Object.entries(params).forEach(([chave, valor]) => {
    if (valor) query.set(chave, valor)
  })

  return apiRequest(`/oportunidades/?${query}`)
}

export function criarOportunidade(payload) {
  return apiRequest('/oportunidades/', { method: 'POST', body: payload })
}

export function obterOportunidade(codigo) {
  return apiRequest(`/oportunidades/${codigo}/`)
}

export function atualizarOportunidade(codigo, payload) {
  return apiRequest(`/oportunidades/${codigo}/`, { method: 'PATCH', body: payload })
}

export function registrarDecisao(codigo, payload) {
  return apiRequest(`/oportunidades/${codigo}/decisao/`, { method: 'POST', body: payload })
}

export function complementarOportunidade(codigo, payload) {
  return apiRequest(`/oportunidades/${codigo}/complementar/`, {
    method: 'POST',
    body: payload,
  })
}

export function listarHistorico(codigo) {
  return apiRequest(`/oportunidades/${codigo}/historico/`)
}

export function listarRede(params = {}) {
  const query = new URLSearchParams({ page_size: '100' })

  Object.entries(params).forEach(([chave, valor]) => {
    if (valor) query.set(chave, valor)
  })

  return apiRequest(`/rede/?${query}`)
}

export function obterMembroRede(id) {
  return apiRequest(`/rede/${id}/`)
}

export function criarMembroRede(payload) {
  return apiRequest('/rede/', { method: 'POST', body: payload })
}

export function atualizarMembroRede(id, payload) {
  return apiRequest(`/rede/${id}/`, { method: 'PATCH', body: payload })
}

export function liberarAcessoMembro(id) {
  return apiRequest(`/rede/${id}/liberar-acesso/`, { method: 'POST' })
}

export function obterMeuPerfil() {
  return apiRequest('/rede/meu-perfil/')
}

export function atualizarMeuPerfil(payload) {
  return apiRequest('/rede/meu-perfil/', { method: 'PATCH', body: payload })
}

export function listarTitulacoes() {
  return apiRequest('/rede/titulacoes/')
}
