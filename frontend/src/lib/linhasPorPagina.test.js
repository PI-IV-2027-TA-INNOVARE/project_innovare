import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TODAS_AS_LINHAS, paginar, useLinhasPorPagina } from './linhasPorPagina'

describe('useLinhasPorPagina', () => {
  it('começa no padrão da tela', () => {
    const { result } = renderHook(() => useLinhasPorPagina('teste', 25))

    expect(result.current[0]).toBe(25)
  })

  it('guarda a escolha de cada tela no navegador', () => {
    /**
     * Quem prefere ver todos não precisa escolher de novo a cada visita. A
     * escolha é por tela: "Todos" em Oportunidades não muda Usuários.
     */
    const { result } = renderHook(() => useLinhasPorPagina('teste', 25))

    act(() => result.current[1](TODAS_AS_LINHAS))

    expect(renderHook(() => useLinhasPorPagina('teste', 25)).result.current[0]).toBe(TODAS_AS_LINHAS)
    expect(renderHook(() => useLinhasPorPagina('outra', 10)).result.current[0]).toBe(10)
  })

  it('valor guardado que não é opção volta ao padrão', () => {
    window.localStorage.setItem('pdconnect.linhasPorPagina.teste', '7')

    expect(renderHook(() => useLinhasPorPagina('teste', 25)).result.current[0]).toBe(25)
  })
})

describe('paginar', () => {
  const lista = Array.from({ length: 12 }, (_, indice) => indice + 1)

  it('corta a página pedida e diz onde ela começa e termina', () => {
    expect(paginar(lista, 2, 10)).toEqual({
      visiveis: [11, 12],
      paginaAtual: 2,
      totalPaginas: 2,
      inicio: 10,
      fim: 12,
    })
  })

  it('"Todos" põe a lista inteira numa página', () => {
    expect(paginar(lista, 1, TODAS_AS_LINHAS)).toMatchObject({
      visiveis: lista,
      totalPaginas: 1,
      fim: 12,
    })
  })

  it('página além do fim cai na última', () => {
    expect(paginar(lista, 9, 10).paginaAtual).toBe(2)
  })
})
