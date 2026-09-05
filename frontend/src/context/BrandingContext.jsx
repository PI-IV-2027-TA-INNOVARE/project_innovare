import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from './ThemeContext'
import {
  BRAND_TOKEN_GROUPS,
  buildCssVariables,
  getDefaultBranding,
} from '../theme/brandTokens'

/**
 * Personalizacao visual em tempo real.
 *
 * O admin sobrescreve tokens de marca e a mudanca vale imediatamente para toda
 * a aplicacao, sem reload: aplicamos as CSS custom properties direto no <html>.
 * Cada tema (claro/escuro) guarda seu proprio conjunto de valores.
 */

const BrandingContext = createContext(null)

const STORAGE_KEY = 'pdconnect.branding.v1'
const THEMES = ['light', 'dark']

function readStoredBranding() {
  if (typeof window === 'undefined') return { light: {}, dark: {} }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null

    if (!parsed || typeof parsed !== 'object') {
      return { light: {}, dark: {} }
    }

    return {
      light: parsed.light && typeof parsed.light === 'object' ? parsed.light : {},
      dark: parsed.dark && typeof parsed.dark === 'object' ? parsed.dark : {},
    }
  } catch {
    // localStorage indisponivel (aba anonima, storage bloqueado): segue no padrao.
    return { light: {}, dark: {} }
  }
}

function persistBranding(overrides) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // Persistencia e conveniencia; a sessao atual continua funcionando sem ela.
  }
}

export function BrandingProvider({ children }) {
  const { theme } = useTheme()
  const [overrides, setOverrides] = useState(readStoredBranding)
  const appliedVarsRef = useRef([])

  // Valores efetivos = padrao da AC2 para o tema atual + o que o admin mudou.
  const branding = useMemo(
    () => ({ ...getDefaultBranding(theme), ...(overrides[theme] || {}) }),
    [overrides, theme]
  )

  useEffect(() => {
    if (typeof document === 'undefined') return

    const root = document.documentElement
    const variables = buildCssVariables(branding)

    // Limpa o que foi aplicado antes para que "restaurar padrao" volte ao CSS.
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

  useEffect(() => {
    persistBranding(overrides)
  }, [overrides])

  const setTokenValue = useCallback((tokenId, value) => {
    setOverrides((current) => ({
      ...current,
      [theme]: { ...(current[theme] || {}), [tokenId]: value },
    }))
  }, [theme])

  const resetToken = useCallback((tokenId) => {
    setOverrides((current) => {
      const next = { ...(current[theme] || {}) }
      delete next[tokenId]

      return { ...current, [theme]: next }
    })
  }, [theme])

  /** Restaura a paleta oficial da AC2 no tema atual. */
  const resetTheme = useCallback(() => {
    setOverrides((current) => ({ ...current, [theme]: {} }))
  }, [theme])

  /** Restaura a paleta oficial da AC2 nos dois temas. */
  const resetAll = useCallback(() => {
    setOverrides({ light: {}, dark: {} })
  }, [])

  const customizedTokenIds = useMemo(
    () => Object.keys(overrides[theme] || {}),
    [overrides, theme]
  )

  const value = useMemo(() => ({
    theme,
    branding,
    groups: BRAND_TOKEN_GROUPS,
    customizedTokenIds,
    isCustomized: customizedTokenIds.length > 0,
    hasAnyCustomization: THEMES.some((name) => Object.keys(overrides[name] || {}).length > 0),
    setTokenValue,
    resetToken,
    resetTheme,
    resetAll,
  }), [
    branding,
    customizedTokenIds,
    overrides,
    resetAll,
    resetTheme,
    resetToken,
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
