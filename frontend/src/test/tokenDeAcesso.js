/**
 * Um token de acesso no formato do SimpleJWT, com a conta em `user_id`.
 *
 * A assinatura é de mentira: o front só lê de quem é o token, e quem confere a
 * assinatura é o servidor.
 */
export function tokenDeAcesso(idUsuario, emissao = 'a') {
  const corpo = btoa(JSON.stringify({ token_type: 'access', user_id: String(idUsuario), jti: emissao }))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `cabecalho.${corpo}.assinatura`
}
