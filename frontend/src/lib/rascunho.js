import { useEffect, useMemo, useState } from 'react'

const PREFIXO = 'pdconnect.rascunho'

export function chaveDoRascunho(namespace, identificador) {
  return `${PREFIXO}-${namespace}:${identificador || 'anonimo'}`
}

export function lerRascunho(namespace, identificador) {
  try {
    const bruto = window.localStorage.getItem(chaveDoRascunho(namespace, identificador))

    if (!bruto) return null

    const { valores, em } = JSON.parse(bruto)

    return valores && typeof valores === 'object' ? { valores, em } : null
  } catch {
    return null
  }
}

export function gravarRascunho(namespace, identificador, valores) {
  try {
    window.localStorage.setItem(
      chaveDoRascunho(namespace, identificador),
      JSON.stringify({ valores, em: Date.now() })
    )
  } catch {
  }
}

export function limparRascunho(namespace, identificador) {
  try {
    window.localStorage.removeItem(chaveDoRascunho(namespace, identificador))
  } catch {
  }
}

export function useRascunho(namespace, identificador, vazio) {
  const recuperado = useMemo(
    () => lerRascunho(namespace, identificador),
    [identificador, namespace]
  )

  const [valores, setValores] = useState(() => ({ ...vazio, ...(recuperado?.valores || {}) }))
  const [rascunhoEm, setRascunhoEm] = useState(recuperado?.em || null)

  const alterado = useMemo(
    () => Object.keys(vazio).some(
      (campo) => String(valores[campo] ?? '').trim() !== String(vazio[campo] ?? '').trim()
    ),
    [valores, vazio]
  )

  useEffect(() => {
    if (alterado) {
      gravarRascunho(namespace, identificador, valores)
    } else {
      limparRascunho(namespace, identificador)
    }
  }, [alterado, identificador, namespace, valores])

  const descartar = () => {
    limparRascunho(namespace, identificador)
    setValores(vazio)
    setRascunhoEm(null)
  }

  const limpar = () => limparRascunho(namespace, identificador)

  return { valores, setValores, alterado, rascunhoEm, descartar, limpar }
}
