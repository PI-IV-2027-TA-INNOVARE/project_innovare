import { matchPath } from 'react-router-dom'
import { ROLES } from './roles'

export const PAPEIS = Object.freeze({
  OPORTUNIDADES: [ROLES.SUPERVISOR, ROLES.PESQUISADOR],
  IDEIA_INTERNA: [ROLES.SUPERVISOR],
  PROBLEMAS: [ROLES.DEMANDANTE],
  REDE: [ROLES.SUPERVISOR],
  ADMIN: [ROLES.ADMINISTRADOR],
})

export const ROTAS_PROTEGIDAS = Object.freeze([
  { padrao: '/painel', papeis: null },
  { padrao: '/sem-acesso', papeis: null },
  { padrao: '/oportunidades', papeis: PAPEIS.OPORTUNIDADES },
  { padrao: '/oportunidades/nova', papeis: PAPEIS.IDEIA_INTERNA },
  { padrao: '/oportunidades/:id', papeis: PAPEIS.OPORTUNIDADES },
  { padrao: '/problemas', papeis: PAPEIS.PROBLEMAS },
  { padrao: '/problemas/novo', papeis: PAPEIS.PROBLEMAS },
  { padrao: '/problemas/:id', papeis: PAPEIS.PROBLEMAS },
  { padrao: '/perfil', papeis: null },
  { padrao: '/rede', papeis: PAPEIS.REDE },
  { padrao: '/rede/novo', papeis: PAPEIS.REDE },
  { padrao: '/rede/:id', papeis: PAPEIS.REDE },
  { padrao: '/admin', papeis: PAPEIS.ADMIN },
  { padrao: '/admin/aparencia', papeis: PAPEIS.ADMIN },
  { padrao: '/admin/usuarios', papeis: PAPEIS.ADMIN },
  { padrao: '/admin/parametros', papeis: PAPEIS.ADMIN },
])

export function rotaInicialDe(papel) {
  return papel === ROLES.ADMINISTRADOR ? '/admin' : '/painel'
}

export function podeAcessar(papel, pathname) {
  if (!papel || typeof pathname !== 'string' || !pathname.trim()) {
    return false
  }

  const rota = ROTAS_PROTEGIDAS.find((item) => matchPath(item.padrao, pathname))

  if (!rota) return false

  return rota.papeis === null || rota.papeis.includes(papel)
}

export function destinoAposLogin(papel, from) {
  return podeAcessar(papel, from) ? from : rotaInicialDe(papel)
}
