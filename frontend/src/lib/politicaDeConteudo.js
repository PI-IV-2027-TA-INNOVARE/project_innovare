/**
 * A política de conteúdo (CSP) que o build grava no `index.html`.
 *
 * Só roda script servido pelo próprio site: um texto malicioso que chegasse à
 * tela não executa, e não há de onde carregar outro script. A API em outro
 * endereço entra só em `connect-src`. O estilo aceita `'unsafe-inline'` porque
 * o React e as bibliotecas aplicam estilo na página; estilo não executa código.
 *
 * Em desenvolvimento a política não entra: o Vite injeta script na página para
 * recarregar o código, e a política o bloquearia.
 */
export function politicaDeConteudo(enderecoDaApi = '') {
  const origemDaApi = /^https?:\/\//i.test(enderecoDaApi) ? new URL(enderecoDaApi).origin : ''

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self'${origemDaApi ? ` ${origemDaApi}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}
