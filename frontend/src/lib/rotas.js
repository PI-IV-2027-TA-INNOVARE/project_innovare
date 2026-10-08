import { matchPath } from 'react-router-dom'
import { ROLES } from './roles'

export const PAPEIS = Object.freeze({
  OPORTUNIDADES: [ROLES.SUPERVISOR, ROLES.PESQUISADOR],
  IDEIA_INTERNA: [ROLES.SUPERVISOR],
  PROBLEMAS: [ROLES.DEMANDANTE],
  REDE: [ROLES.SUPERVISOR],
  INDICADORES: [ROLES.SUPERVISOR, ROLES.PESQUISADOR, ROLES.DEMANDANTE],
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
  { padrao: '/indicadores', papeis: PAPEIS.INDICADORES },
  { padrao: '/rede', papeis: PAPEIS.REDE },
  { padrao: '/rede/novo', papeis: PAPEIS.REDE },
  { padrao: '/rede/:id', papeis: PAPEIS.REDE },
  { padrao: '/admin', papeis: PAPEIS.ADMIN },
  { padrao: '/admin/aparencia', papeis: PAPEIS.ADMIN },
  { padrao: '/admin/usuarios', papeis: PAPEIS.ADMIN },
  { padrao: '/admin/parametros', papeis: PAPEIS.ADMIN },
  { padrao: '/admin/auditoria', papeis: PAPEIS.ADMIN },
])

const ROTA_POR_ENTIDADE = Object.freeze({
  oportunidade: Object.freeze({
    [ROLES.SUPERVISOR]: '/oportunidades',
    [ROLES.PESQUISADOR]: '/oportunidades',
    [ROLES.DEMANDANTE]: '/problemas',
  }),
})

export function rotaInicialDe(papel) {
  return papel === ROLES.ADMINISTRADOR ? '/admin' : '/painel'
}

/**
 * O destino de um aviso, no papel de quem o recebeu.
 *
 * A mesma oportunidade abre em telas diferentes: o Demandante a vê como o
 * problema dele, o Supervisor como o registro que conduz. O servidor manda o
 * par entidade/identificador justamente para não escolher rota — quem conhece
 * rota é este módulo.
 *
 * `null` quando não há tela: o Administrador não acompanha oportunidade, e um
 * link que cai no /sem-acesso é pior que texto sem link, porque promete antes
 * de negar.
 */
export function rotaDaEntidade(papel, entidade, identificador) {
  const base = ROTA_POR_ENTIDADE[entidade]?.[papel]

  if (!base || !identificador) return null

  return `${base}/${identificador}`
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
