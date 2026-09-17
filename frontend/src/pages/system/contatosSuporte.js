const CHAVE = 'pdconnect.contatos-suporte'

export const CONTATOS_PADRAO = Object.freeze([
  {
    nome: 'Núcleo de P&D — AC2',
    email: 'pd@ac2microbiologia.com.br',
    papel: 'Cadastro e liberação de acesso',
  },
  {
    nome: 'Administração da plataforma',
    email: 'admin@ac2microbiologia.com.br',
    papel: 'Contas, perfis e permissões',
  },
])

function valido(contato) {
  return Boolean(contato) && typeof contato.nome === 'string' && typeof contato.email === 'string'
}

export function lerContatos() {
  try {
    const bruto = window.localStorage.getItem(CHAVE)

    if (!bruto) return [...CONTATOS_PADRAO]

    const lista = JSON.parse(bruto)

    if (!Array.isArray(lista) || lista.length === 0 || !lista.every(valido)) {
      return [...CONTATOS_PADRAO]
    }

    return lista
  } catch {
    return [...CONTATOS_PADRAO]
  }
}

export function gravarContatos(lista) {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(lista))
  } catch {
  }
}

export function restaurarContatos() {
  try {
    window.localStorage.removeItem(CHAVE)
  } catch {
  }

  return [...CONTATOS_PADRAO]
}
