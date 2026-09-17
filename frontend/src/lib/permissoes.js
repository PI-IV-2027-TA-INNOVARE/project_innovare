import { ROLES } from './roles'

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
