import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // Suite de testes do frontend (item Q6 do PLANO_IMPLEMENTACAO.md).
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}'],
    // `css: false` (padrao) stuba os imports de .scss: o teste checa
    // comportamento e acessibilidade, nao aparencia — e nao paga o custo de
    // compilar Sass a cada arquivo.
    css: false,

    // AGENTS.md §0.1: teste nao pode depender de ambiente. O `.env` local nao
    // e versionado e traz `VITE_AUTH_MOCK=true`, o que faria a suite passar ou
    // falhar conforme a maquina. Aqui o valor e fixado; o teste que precisa do
    // modo demonstracao usa `vi.mock` no proprio arquivo.
    env: {
      VITE_AUTH_MOCK: 'false',
      VITE_API_BASE_URL: 'http://localhost/api',
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/test/**', 'src/main.jsx'],
    },
  },
})
