import { useEffect, useRef } from 'react'

export const INTERVALO_MINIMO_MS = 2000

export function useAtualizarAoFocar(atualizar, { ativo = true } = {}) {
  const atualizarRef = useRef(atualizar)
  const ultimaAtualizacaoRef = useRef(0)

  useEffect(() => {
    atualizarRef.current = atualizar
  }, [atualizar])

  useEffect(() => {
    if (!ativo) return undefined

    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return

      const agora = Date.now()
      if (agora - ultimaAtualizacaoRef.current < INTERVALO_MINIMO_MS) return

      ultimaAtualizacaoRef.current = agora
      atualizarRef.current()
    }

    window.addEventListener('focus', aoVoltar)
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      window.removeEventListener('focus', aoVoltar)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [ativo])
}
