/**
 * Os quatro atores funcionais do P&D Connect (baseline de atores v1.0).
 *
 * O backend ainda modela apenas `pesquisador` e `empresa`; o front já trabalha
 * com os quatro papéis para que as telas e os guards de rota nasçam alinhados à
 * baseline. A convergência do backend está na Fase 2 do PLANO_IMPLEMENTACAO.md.
 */

export const ROLES = Object.freeze({
  DEMANDANTE: 'demandante',
  PESQUISADOR: 'pesquisador',
  SUPERVISOR: 'supervisor',
  ADMINISTRADOR: 'administrador',
})

export const ROLE_LABELS = Object.freeze({
  [ROLES.DEMANDANTE]: 'Demandante Externo',
  [ROLES.PESQUISADOR]: 'Pesquisador',
  [ROLES.SUPERVISOR]: 'Supervisor',
  [ROLES.ADMINISTRADOR]: 'Administrador',
})

export const ROLE_DESCRIPTIONS = Object.freeze({
  [ROLES.DEMANDANTE]:
    'Cadastra e acompanha os problemas e desafios da sua organização.',
  [ROLES.PESQUISADOR]:
    'Mantém o próprio perfil profissional e acompanha as oportunidades disponibilizadas.',
  [ROLES.SUPERVISOR]:
    'Representa o Núcleo de P&D: conduz a oportunidade da entrada ao fechamento e registra a decisão.',
  [ROLES.ADMINISTRADOR]:
    'Administra contas, acessos, permissões e configurações da plataforma.',
})

export function roleLabel(role) {
  return ROLE_LABELS[role] || 'Perfil não identificado'
}

export function roleDescription(role) {
  return ROLE_DESCRIPTIONS[role] || ''
}

export function hasRole(user, role) {
  return Boolean(user) && user.role === role
}

export function isAdministrador(user) {
  return hasRole(user, ROLES.ADMINISTRADOR)
}
