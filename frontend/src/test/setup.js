import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Com `globals: true` o RTL ja desmonta sozinho, mas deixar explicito evita
// vazamento de DOM entre arquivos se a opcao mudar.
afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

// O jsdom nao implementa matchMedia, e o ThemeContext consulta
// `prefers-color-scheme` no primeiro render. Sem este stub qualquer teste que
// monte a arvore de contextos quebra.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}
