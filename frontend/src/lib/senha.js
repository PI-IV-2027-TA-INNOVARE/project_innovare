export const MINIMO_DA_SENHA = 8

/**
 * As regras que o servidor aplica a toda senha nova (`AUTH_PASSWORD_VALIDATORS`
 * do backend). A tela mostra as quatro antes do envio; as duas primeiras ela
 * mesma confere, e as outras duas so o servidor sabe julgar.
 */
export const REGRAS_DA_SENHA = Object.freeze([
  `ter pelo menos ${MINIMO_DA_SENHA} caracteres;`,
  'não ter só números;',
  'não ser parecida com o seu nome ou o seu e-mail;',
  'não ser uma senha comum, como 12345678 ou senha123.',
])

export function problemaNaNovaSenha(senha) {
  if (!senha) return 'Informe a nova senha.'

  if (senha.length < MINIMO_DA_SENHA) {
    return `A senha precisa de pelo menos ${MINIMO_DA_SENHA} caracteres.`
  }

  if (/^\d+$/.test(senha)) return 'A senha não pode ter só números.'

  return ''
}

export function problemaNaConfirmacao(senha, confirmacao) {
  if (!confirmacao) return 'Repita a nova senha para confirmar.'
  if (senha !== confirmacao) return 'As senhas não coincidem.'

  return ''
}

export function errosDosCampos(falha, campos) {
  const dados = falha?.data

  if (!dados || typeof dados !== 'object') return {}

  return Object.fromEntries(
    Object.entries(campos)
      .filter(([chave]) => chave in dados)
      .map(([chave, campo]) => [campo, [].concat(dados[chave]).join(' ')])
  )
}
