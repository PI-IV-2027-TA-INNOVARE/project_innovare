import { apiRequest, baixarArquivo } from '../lib/api'

export function requestAuthToken(payload) {
  return apiRequest('/auth/token/', {
    method: 'POST',
    body: payload,
    credentials: 'include',
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
  return apiRequest('/auth/change-password/', {
    method: 'POST',
    body: payload,
    credentials: 'include',
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

export function buscarEmpresaPorCnpj(cnpj) {
  return apiRequest(`/usuarios/empresa/?${new URLSearchParams({ cnpj })}`)
}

export function atualizarTelefone(telefone) {
  return apiRequest('/auth/profile/', { method: 'PATCH', body: { telefone } })
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

export function encerrarSessao() {
  return apiRequest('/auth/logout/', {
    method: 'POST',
    body: {},
    credentials: 'include',
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

export function obterProposta(codigo) {
  return apiRequest(`/oportunidades/${codigo}/proposta/`)
}

export function obterRelatorioOportunidade(codigo) {
  return apiRequest(`/oportunidades/${codigo}/relatorio/`)
}

export function criarProposta(codigo) {
  return apiRequest(`/oportunidades/${codigo}/proposta/`, { method: 'POST' })
}

export function atualizarProposta(codigo, payload) {
  return apiRequest(`/oportunidades/${codigo}/proposta/`, { method: 'PATCH', body: payload })
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

export function registrarObservacao(codigo, texto) {
  return apiRequest(`/oportunidades/${codigo}/observacoes/`, {
    method: 'POST',
    body: { texto },
  })
}

export function solicitarComplemento(codigo, mensagem) {
  return apiRequest(`/oportunidades/${codigo}/solicitar-complemento/`, {
    method: 'POST',
    body: { mensagem },
  })
}

export function listarAnexos(codigo) {
  return apiRequest(`/oportunidades/${codigo}/anexos/`)
}

export function baixarMeusDados() {
  return baixarArquivo('/auth/meus-dados/', { nomePadrao: 'meus-dados.json' })
}

export function obterPedidoDeExclusao() {
  return apiRequest('/auth/meus-dados/exclusao/')
}

export function pedirExclusaoDaConta() {
  return apiRequest('/auth/meus-dados/exclusao/', { method: 'POST' })
}

export function anonimizarConta(idUsuario) {
  return apiRequest(`/usuarios/${idUsuario}/anonimizar/`, { method: 'POST' })
}

export function baixarAnexo(codigo, anexo) {
  return baixarArquivo(`/oportunidades/${codigo}/anexos/${anexo.id_anexo}/`, {
    nomePadrao: anexo.nome_original,
  })
}

export function enviarAnexo(codigo, arquivo) {
  const corpo = new FormData()
  corpo.append('arquivo', arquivo)

  return apiRequest(`/oportunidades/${codigo}/anexos/`, {
    method: 'POST',
    body: corpo,
  })
}

export function listarTrilha(params = {}) {
  const query = new URLSearchParams({ page_size: '50' })

  Object.entries(params).forEach(([chave, valor]) => {
    if (valor) query.set(chave, valor)
  })

  return apiRequest(`/trilha/?${query}`)
}

export function obterFiltrosTrilha() {
  return apiRequest('/trilha/filtros/')
}

export function obterIndicadores() {
  return apiRequest('/indicadores/')
}

export function listarNotificacoes(params = {}) {
  const query = new URLSearchParams({ page_size: '10' })

  Object.entries(params).forEach(([chave, valor]) => {
    if (valor) query.set(chave, valor)
  })

  return apiRequest(`/notificacoes/?${query}`)
}

export function contarNotificacoesNaoLidas() {
  return apiRequest('/notificacoes/nao-lidas/')
}

export function marcarNotificacaoLida(id) {
  return apiRequest(`/notificacoes/${id}/lida/`, { method: 'POST' })
}

export function marcarTodasNotificacoesLidas() {
  return apiRequest('/notificacoes/marcar-todas-lidas/', { method: 'POST' })
}

export function obterEstadoCopiloto(codigo) {
  return apiRequest(`/oportunidades/${codigo}/copiloto/`)
}

export function iniciarSessaoCopiloto(codigo) {
  return apiRequest(`/oportunidades/${codigo}/copiloto/`, { method: 'POST' })
}

export function responderCopiloto(codigo, texto, { elemento, pergunta } = {}) {
  return apiRequest(`/oportunidades/${codigo}/copiloto/responder/`, {
    method: 'POST',
    body: elemento ? { texto, elemento, pergunta: pergunta || '' } : { texto },
  })
}

export function atualizarSinteseCopiloto(codigo, sintese) {
  return apiRequest(`/oportunidades/${codigo}/copiloto/sintese/`, {
    method: 'PATCH',
    body: { sintese },
  })
}

export function aceitarSugestaoCopiloto(codigo, elemento, texto) {
  return apiRequest(`/oportunidades/${codigo}/copiloto/sugestoes/aceitar/`, {
    method: 'POST',
    body: { elemento, texto },
  })
}

export function estruturarComCopiloto(codigo) {
  return apiRequest(`/oportunidades/${codigo}/copiloto/estruturar/`, {
    method: 'POST',
  })
}

export function concluirSessaoCopiloto(codigo) {
  return apiRequest(`/oportunidades/${codigo}/copiloto/concluir/`, { method: 'POST' })
}

export function listarCompetencias(codigo) {
  return apiRequest(`/oportunidades/${codigo}/competencias/`)
}

export function derivarCompetencias(codigo) {
  return apiRequest(`/oportunidades/${codigo}/competencias/derivar/`, {
    method: 'POST',
  })
}

export function adicionarCompetencia(codigo, payload) {
  return apiRequest(`/oportunidades/${codigo}/competencias/`, {
    method: 'POST',
    body: payload,
  })
}

export function atualizarCompetencia(codigo, id, payload) {
  return apiRequest(`/oportunidades/${codigo}/competencias/${id}/`, {
    method: 'PATCH',
    body: payload,
  })
}

export function removerCompetencia(codigo, id) {
  return apiRequest(`/oportunidades/${codigo}/competencias/${id}/`, {
    method: 'DELETE',
  })
}

export function obterEquipePotencial(codigo) {
  return apiRequest(`/oportunidades/${codigo}/equipe/`)
}

export function executarMatching(codigo) {
  return apiRequest(`/oportunidades/${codigo}/equipe/`, { method: 'POST' })
}

export function ajustarMembroEquipe(codigo, id, payload) {
  return apiRequest(`/oportunidades/${codigo}/equipe/membros/${id}/`, {
    method: 'PATCH',
    body: payload,
  })
}

export function adicionarMembroEquipe(codigo, payload) {
  return apiRequest(`/oportunidades/${codigo}/equipe/membros/`, {
    method: 'POST',
    body: payload,
  })
}

export function validarEquipe(codigo) {
  return apiRequest(`/oportunidades/${codigo}/equipe/validar/`, { method: 'POST' })
}

export function obterPreAnalise(codigo) {
  return apiRequest(`/oportunidades/${codigo}/pre-analise/`)
}

export function executarPreAnalise(codigo) {
  return apiRequest(`/oportunidades/${codigo}/pre-analise/`, { method: 'POST' })
}

export function acatarRecomendacao(codigo, id, acatada) {
  return apiRequest(`/oportunidades/${codigo}/recomendacoes/${id}/`, {
    method: 'PATCH',
    body: { acatada },
  })
}

export function obterSaudeDaPlataforma() {
  return apiRequest('/ia/saude/')
}

export function obterIndicadoresDeIA() {
  return apiRequest('/indicadores/ia/')
}

export function obterRelatorioPreAnalise(codigo) {
  return apiRequest(`/oportunidades/${codigo}/relatorio-preanalise/`)
}

export function obterRelatorioEquipe(codigo) {
  return apiRequest(`/oportunidades/${codigo}/relatorio-equipe/`)
}

export function listarCriteriosPreAnalise() {
  return apiRequest('/ia/criterios/')
}

export function importarCriteriosPreAnalise() {
  return apiRequest('/ia/criterios/', { method: 'POST' })
}

export function lerPrivacidade() {
  return apiRequest('/privacidade/', { skipAuth: true, skipAuthRefresh: true })
}

export function lerContatosSuporte() {
  return apiRequest('/configuracoes/contatos-suporte/', { skipAuth: true, skipAuthRefresh: true })
}

export function gravarContatosSuporte(contatos) {
  return apiRequest('/configuracoes/contatos-suporte/', { method: 'PUT', body: contatos })
}

export function restaurarContatosSuporte() {
  return apiRequest('/configuracoes/contatos-suporte/', { method: 'DELETE' })
}
