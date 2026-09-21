import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from './ThemeContext'
import { carregarTema, salvarTema } from '../services/pdConnectApi'
import {
  BRAND_TOKEN_GROUPS,
  buildCssVariables,
  getDefaultBranding,
} from '../theme/brandTokens'

const BrandingContext = createContext(null)

const STORAGE_KEY = 'pdconnect.branding.v1'
const THEMES = ['light', 'dark']

function vazio() {
  return { light: {}, dark: {} }
}

function normalizar(payload) {
  if (!payload || typeof payload !== 'object') return vazio()

  return {
    light: payload.light && typeof payload.light === 'object' ? payload.light : {},
    dark: payload.dark && typeof payload.dark === 'object' ? payload.dark : {},
  }
}

function lerCache() {
  if (typeof window === 'undefined') return vazio()

  try {
    const bruto = window.localStorage.getItem(STORAGE_KEY)
    return normalizar(bruto ? JSON.parse(bruto) : null)
  } catch {
    return vazio()
  }
}

function gravarCache(payload) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
  }
}

function efetivos(salvo, rascunho, tema) {
  const aplicados = { ...(salvo[tema] || {}) }

  for (const [id, valor] of Object.entries(rascunho[tema] || {})) {
    if (valor === null) {
      delete aplicados[id]
    } else {
      aplicados[id] = valor
    }
  }

  return aplicados
}

export function BrandingProvider({ children }) {
  const { theme } = useTheme()

  const [salvo, setSalvo] = useState(lerCache)
  const [rascunho, setRascunho] = useState(vazio)
  const [origem, setOrigem] = useState({ revisao: 0, autor: null })
  const [salvando, setSalvando] = useState(false)
  const [erroAoSalvar, setErroAoSalvar] = useState('')

  const appliedVarsRef = useRef([])

  useEffect(() => {
    let ativo = true

    carregarTema()
      .then((resposta) => {
        if (!ativo) return

        const payload = normalizar(resposta?.payload)

        setSalvo(payload)
        gravarCache(payload)
        setOrigem({
          revisao: resposta?.revisao || 0,
          autor: resposta?.atualizado_por_nome || null,
        })
      })
      .catch(() => {
        /* Sem servidor, o cache do navegador continua pintando a tela. */
      })

    return () => {
      ativo = false
    }
  }, [])

  const aplicados = useMemo(
    () => efetivos(salvo, rascunho, theme),
    [rascunho, salvo, theme]
  )

  const branding = useMemo(
    () => ({ ...getDefaultBranding(theme), ...aplicados }),
    [aplicados, theme]
  )

  useEffect(() => {
    if (typeof document === 'undefined') return

    const root = document.documentElement
    const variables = buildCssVariables(branding)

    for (const cssVar of appliedVarsRef.current) {
      if (!(cssVar in variables)) {
        root.style.removeProperty(cssVar)
      }
    }

    for (const [cssVar, value] of Object.entries(variables)) {
      root.style.setProperty(cssVar, value)
    }

    appliedVarsRef.current = Object.keys(variables)
  }, [branding])

  const setTokenValue = useCallback((tokenId, value) => {
    setRascunho((atual) => ({
      ...atual,
      [theme]: { ...(atual[theme] || {}), [tokenId]: value },
    }))
  }, [theme])

  const resetToken = useCallback((tokenId) => {
    setRascunho((atual) => {
      const doTema = { ...(atual[theme] || {}) }

      if (salvo[theme]?.[tokenId] === undefined) {
        delete doTema[tokenId]
      } else {
        doTema[tokenId] = null
      }

      return { ...atual, [theme]: doTema }
    })
  }, [salvo, theme])

  const resetTheme = useCallback(() => {
    setRascunho((atual) => {
      const doTema = {}

      for (const tokenId of Object.keys(salvo[theme] || {})) {
        doTema[tokenId] = null
      }

      return { ...atual, [theme]: doTema }
    })
  }, [salvo, theme])

  const descartarRascunho = useCallback(() => {
    setRascunho(vazio())
    setErroAoSalvar('')
  }, [])

  const salvar = useCallback(async () => {
    const patch = {}

    for (const nome of THEMES) {
      const doTema = rascunho[nome] || {}

      if (Object.keys(doTema).length > 0) {
        patch[nome] = doTema
      }
    }

    if (Object.keys(patch).length === 0) return { ok: true }

    setSalvando(true)
    setErroAoSalvar('')

    try {
      const resposta = await salvarTema(patch)
      const payload = normalizar(resposta?.payload)

      setSalvo(payload)
      gravarCache(payload)
      setOrigem({
        revisao: resposta?.revisao || 0,
        autor: resposta?.atualizado_por_nome || null,
      })
      setRascunho(vazio())

      return { ok: true }
    } catch (problema) {
      const mensagem = problema?.message || 'Nao foi possivel salvar a aparencia.'

      setErroAoSalvar(mensagem)
      return { ok: false, message: mensagem }
    } finally {
      setSalvando(false)
    }
  }, [rascunho])

  const customizedTokenIds = useMemo(() => Object.keys(aplicados), [aplicados])

  const alterado = useMemo(
    () => THEMES.some((nome) => Object.keys(rascunho[nome] || {}).length > 0),
    [rascunho]
  )

  const pendentes = useMemo(
    () => THEMES.reduce((total, nome) => total + Object.keys(rascunho[nome] || {}).length, 0),
    [rascunho]
  )

  const value = useMemo(() => ({
    theme,
    branding,
    groups: BRAND_TOKEN_GROUPS,
    customizedTokenIds,
    isCustomized: customizedTokenIds.length > 0,
    alterado,
    pendentes,
    salvando,
    erroAoSalvar,
    revisao: origem.revisao,
    autor: origem.autor,
    setTokenValue,
    resetToken,
    resetTheme,
    descartarRascunho,
    salvar,
  }), [
    alterado,
    branding,
    customizedTokenIds,
    descartarRascunho,
    erroAoSalvar,
    origem,
    pendentes,
    resetTheme,
    resetToken,
    salvando,
    salvar,
    setTokenValue,
    theme,
  ])

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBranding() {
  const context = useContext(BrandingContext)

  if (!context) {
    throw new Error('useBranding deve ser usado dentro de BrandingProvider')
  }

  return context
}
