/**
 * Todas as páginas de uma lista da API, juntas.
 *
 * A API entrega no máximo 100 itens por página. Telas que filtram e ordenam
 * no navegador precisam da lista inteira, ou perdem sem aviso o que vem
 * depois da primeira página.
 */
export async function todasAsPaginas(listar, parametros = {}) {
  const itens = []

  for (let pagina = 1; ; pagina += 1) {
    const resposta = await listar({ ...parametros, page: String(pagina) })

    if (!Array.isArray(resposta?.results)) return resposta || []

    itens.push(...resposta.results)

    if (!resposta.next) return itens
  }
}
