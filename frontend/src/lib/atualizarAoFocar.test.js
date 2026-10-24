import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INTERVALO_MINIMO_MS, useAtualizarAoFocar } from './atualizarAoFocar'

function definirVisibilidade(estado) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => estado,
  })
}

function focar() {
  window.dispatchEvent(new Event('focus'))
}

function trocarVisibilidade() {
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  definirVisibilidade('visible')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAtualizarAoFocar', () => {
  /**
   * A pagina ja carrega sozinha ao montar. Se o hook tambem carregasse,
   * toda tela abriria com duas requisicoes identicas.
   */
  it('não carrega ao montar — quem monta é a página', () => {
    const atualizar = vi.fn()

    renderHook(() => useAtualizarAoFocar(atualizar))

    expect(atualizar).not.toHaveBeenCalled()
  })

  it('atualiza quando a janela recebe foco', () => {
    const atualizar = vi.fn()
    renderHook(() => useAtualizarAoFocar(atualizar))

    focar()

    expect(atualizar).toHaveBeenCalledTimes(1)
  })

  it('atualiza quando a aba volta a ficar visível', () => {
    const atualizar = vi.fn()
    renderHook(() => useAtualizarAoFocar(atualizar))

    trocarVisibilidade()

    expect(atualizar).toHaveBeenCalledTimes(1)
  })

  /**
   * `visibilitychange` dispara nas duas direcoes. Sair da aba nao e motivo
   * para buscar dado que ninguem esta olhando.
   */
  it('não atualiza quando a aba está escondida', () => {
    const atualizar = vi.fn()
    renderHook(() => useAtualizarAoFocar(atualizar))

    definirVisibilidade('hidden')
    trocarVisibilidade()
    focar()

    expect(atualizar).not.toHaveBeenCalled()
  })

  /**
   * Voltar para a aba dispara `focus` e `visibilitychange` quase juntos. Sem
   * a janela de silencio, cada volta custaria duas requisicoes iguais.
   */
  it('conta uma volta só uma vez, mesmo com os dois eventos', () => {
    const atualizar = vi.fn()
    renderHook(() => useAtualizarAoFocar(atualizar))

    trocarVisibilidade()
    focar()

    expect(atualizar).toHaveBeenCalledTimes(1)
  })

  it('volta a atualizar depois da janela de silêncio', () => {
    const atualizar = vi.fn()
    renderHook(() => useAtualizarAoFocar(atualizar))

    focar()
    vi.advanceTimersByTime(INTERVALO_MINIMO_MS + 1)
    focar()

    expect(atualizar).toHaveBeenCalledTimes(2)
  })

  /**
   * Quem nao acompanha a fila nao tem o que recarregar: o papel decide, e a
   * pagina passa esse "nao" adiante em vez de montar o ouvinte.
   */
  it('não escuta nada quando está desligado', () => {
    const atualizar = vi.fn()
    renderHook(() => useAtualizarAoFocar(atualizar, { ativo: false }))

    focar()
    trocarVisibilidade()

    expect(atualizar).not.toHaveBeenCalled()
  })

  it('para de escutar quando a página sai', () => {
    const atualizar = vi.fn()
    const { unmount } = renderHook(() => useAtualizarAoFocar(atualizar))

    unmount()
    focar()

    expect(atualizar).not.toHaveBeenCalled()
  })

  /**
   * As paginas recriam `carregar` com `useCallback` quando um filtro muda. O
   * ouvinte tem de passar a chamar a versao nova sem precisar remontar.
   */
  it('chama sempre a versão mais recente de carregar', () => {
    const primeira = vi.fn()
    const segunda = vi.fn()

    const { rerender } = renderHook(
      ({ atualizar }) => useAtualizarAoFocar(atualizar),
      { initialProps: { atualizar: primeira } }
    )

    rerender({ atualizar: segunda })
    focar()

    expect(primeira).not.toHaveBeenCalled()
    expect(segunda).toHaveBeenCalledTimes(1)
  })
})
