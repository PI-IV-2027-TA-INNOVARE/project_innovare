import { describe, expect, it } from 'vitest'
import { ROLES } from './roles'
import { ROTAS_PROTEGIDAS, destinoAposLogin, podeAcessar } from './rotas'

describe('podeAcessar', () => {
  it('libera o painel para os quatro atores', () => {
    for (const papel of Object.values(ROLES)) {
      expect(podeAcessar(papel, '/painel')).toBe(true)
      expect(podeAcessar(papel, '/sem-acesso')).toBe(true)
    }
  })

  it('restringe /admin e cada seção do console ao Administrador', () => {
    for (const caminho of [
      '/admin',
      '/admin/aparencia',
      '/admin/usuarios',
      '/admin/parametros',
    ]) {
      expect(podeAcessar(ROLES.ADMINISTRADOR, caminho)).toBe(true)
      expect(podeAcessar(ROLES.SUPERVISOR, caminho)).toBe(false)
      expect(podeAcessar(ROLES.PESQUISADOR, caminho)).toBe(false)
      expect(podeAcessar(ROLES.DEMANDANTE, caminho)).toBe(false)
    }
  })

  it('restringe a rede interna ao Supervisor (RF02 / RN-A04)', () => {
    expect(podeAcessar(ROLES.SUPERVISOR, '/rede')).toBe(true)
    expect(podeAcessar(ROLES.SUPERVISOR, '/rede/novo')).toBe(true)
    expect(podeAcessar(ROLES.SUPERVISOR, '/rede/12')).toBe(true)
    expect(podeAcessar(ROLES.ADMINISTRADOR, '/rede')).toBe(false)
    expect(podeAcessar(ROLES.PESQUISADOR, '/rede')).toBe(false)
  })

  it('abre oportunidades a Supervisor e Pesquisador, e a mais ninguem (D02)', () => {
    for (const caminho of ['/oportunidades', '/oportunidades/OP-2026-014']) {
      expect(podeAcessar(ROLES.SUPERVISOR, caminho)).toBe(true)
      expect(podeAcessar(ROLES.PESQUISADOR, caminho)).toBe(true)
      expect(podeAcessar(ROLES.DEMANDANTE, caminho)).toBe(false)
      expect(podeAcessar(ROLES.ADMINISTRADOR, caminho)).toBe(false)
    }
  })

  it('restringe o cadastro de ideia interna ao Supervisor (RN-A03 / D05)', () => {
    expect(podeAcessar(ROLES.SUPERVISOR, '/oportunidades/nova')).toBe(true)
    expect(podeAcessar(ROLES.PESQUISADOR, '/oportunidades/nova')).toBe(false)
    expect(podeAcessar(ROLES.DEMANDANTE, '/oportunidades/nova')).toBe(false)
    expect(podeAcessar(ROLES.ADMINISTRADOR, '/oportunidades/nova')).toBe(false)
  })

  it('declara /oportunidades/nova antes de /oportunidades/:id', () => {
    const padroes = ROTAS_PROTEGIDAS.map((rota) => rota.padrao)

    expect(padroes.indexOf('/oportunidades/nova'))
      .toBeLessThan(padroes.indexOf('/oportunidades/:id'))
    expect(padroes.indexOf('/problemas/novo'))
      .toBeLessThan(padroes.indexOf('/problemas/:id'))
  })

  it('restringe os problemas externos ao Demandante (D01)', () => {
    for (const caminho of ['/problemas', '/problemas/novo', '/problemas/OP-2026-014']) {
      expect(podeAcessar(ROLES.DEMANDANTE, caminho)).toBe(true)
      expect(podeAcessar(ROLES.SUPERVISOR, caminho)).toBe(false)
      expect(podeAcessar(ROLES.PESQUISADOR, caminho)).toBe(false)
      expect(podeAcessar(ROLES.ADMINISTRADOR, caminho)).toBe(false)
    }
  })

  it('abre a propria conta aos quatro atores', () => {
    for (const papel of Object.values(ROLES)) {
      expect(podeAcessar(papel, '/perfil')).toBe(true)
    }
  })

  it('recusa caminho desconhecido, vazio ou sem papel', () => {
    expect(podeAcessar(ROLES.SUPERVISOR, '/rota-que-nao-existe')).toBe(false)
    expect(podeAcessar(ROLES.SUPERVISOR, '')).toBe(false)
    expect(podeAcessar(ROLES.SUPERVISOR, undefined)).toBe(false)
    expect(podeAcessar(null, '/painel')).toBe(false)
  })
})

describe('destinoAposLogin', () => {
  it('honra o destino que a pessoa tentou alcancar', () => {
    expect(destinoAposLogin(ROLES.SUPERVISOR, '/rede')).toBe('/rede')
    expect(destinoAposLogin(ROLES.ADMINISTRADOR, '/admin')).toBe('/admin')
    expect(destinoAposLogin(ROLES.PESQUISADOR, '/oportunidades/OP-2026-014'))
      .toBe('/oportunidades/OP-2026-014')
  })

  it('ignora o destino herdado de uma sessao de outro papel', () => {
    expect(destinoAposLogin(ROLES.SUPERVISOR, '/admin')).toBe('/painel')
    expect(destinoAposLogin(ROLES.DEMANDANTE, '/oportunidades/OP-2026-014'))
      .toBe('/painel')
  })

  it('cai no painel quando nao ha destino guardado', () => {
    expect(destinoAposLogin(ROLES.SUPERVISOR, undefined)).toBe('/painel')
    expect(destinoAposLogin(ROLES.SUPERVISOR, '')).toBe('/painel')
    expect(destinoAposLogin(ROLES.DEMANDANTE, '/rota-que-nao-existe')).toBe('/painel')
  })
})

describe('ROTAS_PROTEGIDAS', () => {
  it('cobre toda rota autenticada de App.jsx', () => {
    const declaradas = ROTAS_PROTEGIDAS.map((rota) => rota.padrao)

    expect(declaradas).toEqual([
      '/painel',
      '/sem-acesso',
      '/oportunidades',
      '/oportunidades/nova',
      '/oportunidades/:id',
      '/problemas',
      '/problemas/novo',
      '/problemas/:id',
      '/perfil',
      '/rede',
      '/rede/novo',
      '/rede/:id',
      '/admin',
      '/admin/aparencia',
      '/admin/usuarios',
      '/admin/parametros',
    ])
  })

  it('todo papel declarado e um dos quatro atores da baseline', () => {
    const validos = Object.values(ROLES)

    for (const rota of ROTAS_PROTEGIDAS) {
      if (rota.papeis === null) continue
      for (const papel of rota.papeis) {
        expect(validos).toContain(papel)
      }
    }
  })
})
