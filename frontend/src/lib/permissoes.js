import { ROLES } from './roles'

export const PAPEIS_DA_MATRIZ = Object.freeze([
  ROLES.DEMANDANTE,
  ROLES.PESQUISADOR,
  ROLES.SUPERVISOR,
  ROLES.ADMINISTRADOR,
])

/**
 * A matriz macro do `CONTEXT.md` secao 3, em forma de tela.
 *
 * Ela e fixa de proposito: permissao e regra de negocio, e uma tela que edita
 * a propria regra transformaria o console em um lugar onde se concede acesso
 * sem passar pelo controle de escopo. A leitura e o que o Administrador
 * precisa para conferir quem pode o que.
 */
export const MATRIZ_DE_RESPONSABILIDADES = Object.freeze([
  {
    acao: 'Cadastrar problema externo',
    [ROLES.DEMANDANTE]: 'Sim',
    [ROLES.PESQUISADOR]: 'Não',
    [ROLES.SUPERVISOR]: 'Acompanha',
    [ROLES.ADMINISTRADOR]: 'Não',
  },
  {
    acao: 'Cadastrar ideia interna',
    [ROLES.DEMANDANTE]: 'Não',
    [ROLES.PESQUISADOR]: 'Não',
    [ROLES.SUPERVISOR]: 'Sim',
    [ROLES.ADMINISTRADOR]: 'Não',
  },
  {
    acao: 'Cadastrar pesquisador',
    [ROLES.DEMANDANTE]: 'Não',
    [ROLES.PESQUISADOR]: 'Não',
    [ROLES.SUPERVISOR]: 'Sim',
    [ROLES.ADMINISTRADOR]: 'Não',
  },
  {
    acao: 'Autocadastro de pesquisador',
    [ROLES.DEMANDANTE]: 'Não',
    [ROLES.PESQUISADOR]: 'Não',
    [ROLES.SUPERVISOR]: 'Não',
    [ROLES.ADMINISTRADOR]: 'Não',
  },
  {
    acao: 'Editar o próprio perfil de pesquisador',
    [ROLES.DEMANDANTE]: 'Não',
    [ROLES.PESQUISADOR]: 'Sim',
    [ROLES.SUPERVISOR]: 'Não',
    [ROLES.ADMINISTRADOR]: 'Não',
  },
  {
    acao: 'Acompanhar oportunidades autorizadas',
    [ROLES.DEMANDANTE]: 'Próprias',
    [ROLES.PESQUISADOR]: 'Sim',
    [ROLES.SUPERVISOR]: 'Sim',
    [ROLES.ADMINISTRADOR]: 'Administrativo',
  },
  {
    acao: 'Analisar e ajustar a equipe potencial',
    [ROLES.DEMANDANTE]: 'Não',
    [ROLES.PESQUISADOR]: 'Não',
    [ROLES.SUPERVISOR]: 'Sim',
    [ROLES.ADMINISTRADOR]: 'Não',
  },
  {
    acao: 'Decidir continuidade, revisão ou arquivamento',
    [ROLES.DEMANDANTE]: 'Não',
    [ROLES.PESQUISADOR]: 'Não',
    [ROLES.SUPERVISOR]: 'Sim',
    [ROLES.ADMINISTRADOR]: 'Não',
  },
  {
    acao: 'Gerenciar contas e permissões',
    [ROLES.DEMANDANTE]: 'Não',
    [ROLES.PESQUISADOR]: 'Não',
    [ROLES.SUPERVISOR]: 'Não',
    [ROLES.ADMINISTRADOR]: 'Sim',
  },
])

export const PERMISSOES = Object.freeze({
  CONTAS: 'conta.gerenciar',
  CONFIGURACAO: 'configuracao.gerenciar',
  AUDITORIA: 'auditoria.consultar',
})

const PAPEL_QUANDO_SEM_CATALOGO = Object.freeze({
  [PERMISSOES.CONTAS]: [ROLES.ADMINISTRADOR],
  [PERMISSOES.CONFIGURACAO]: [ROLES.ADMINISTRADOR],
  [PERMISSOES.AUDITORIA]: [ROLES.ADMINISTRADOR],
})

export function podeVer(user, chave) {
  if (!user || !chave) return false

  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions.includes(chave)
  }

  return (PAPEL_QUANDO_SEM_CATALOGO[chave] || []).includes(user.role)
}
