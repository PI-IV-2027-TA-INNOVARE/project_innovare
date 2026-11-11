import { useCallback, useState } from 'react'

export const OPCOES_DE_LINHAS = Object.freeze([10, 25, 50])

export const TODAS_AS_LINHAS = 0

function chaveDa(tela) {
  return `pdconnect.linhasPorPagina.${tela}`
}

function preferenciaGuardada(tela, padrao) {
  try {
    const guardada = window.localStorage.getItem(chaveDa(tela))

    if (guardada === null) return padrao

    const valor = Number(guardada)

    return valor === TODAS_AS_LINHAS || OPCOES_DE_LINHAS.includes(valor) ? valor : padrao
  } catch {
    return padrao
  }
}

/**
 * Quantas linhas a tela mostra por página, lembrada no navegador por tela.
 *
 * A lembrança é conveniência de quem usa: se o navegador recusar guardar, a
 * tela segue com o padrão.
 */
export function useLinhasPorPagina(tela, padrao) {
  const [porPagina, setPorPagina] = useState(() => preferenciaGuardada(tela, padrao))

  const escolher = useCallback(
    (valor) => {
      setPorPagina(valor)

      try {
        window.localStorage.setItem(chaveDa(tela), String(valor))
      } catch {
      }
    },
    [tela]
  )

  return [porPagina, escolher]
}

export function paginar(lista, pagina, porPagina) {
  const tamanho = porPagina === TODAS_AS_LINHAS ? Math.max(lista.length, 1) : porPagina
  const totalPaginas = Math.max(1, Math.ceil(lista.length / tamanho))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const inicio = (paginaAtual - 1) * tamanho

  return {
    visiveis: lista.slice(inicio, inicio + tamanho),
    paginaAtual,
    totalPaginas,
    inicio,
    fim: Math.min(inicio + tamanho, lista.length),
  }
}
