import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext(null)
const THEME_STORAGE_KEY = 'pdconnect.theme'
const THEME_VALUES = new Set(['light', 'dark'])

/**
 * Preferencia salva > preferencia do sistema > claro.
 *
 * O fallback para `prefers-color-scheme` importa na tela de login: ela e a
 * primeira coisa que o usuario ve, antes de existir qualquer escolha salva.
 */
function getStoredTheme() {
  if (typeof window === 'undefined') return 'light'

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)

  if (THEME_VALUES.has(storedTheme)) return storedTheme

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches

  return prefersDark ? 'dark' : 'light'
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return

  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const value = useMemo(() => ({
    theme,
    isDark: theme === 'dark',
    toggleTheme: () => setTheme((currentTheme) => (
      currentTheme === 'dark' ? 'light' : 'dark'
    )),
  }), [theme])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme deve ser usado dentro de ThemeProvider')
  }

  return context
}
