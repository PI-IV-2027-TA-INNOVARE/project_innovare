import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { politicaDeConteudo } from './src/lib/politicaDeConteudo.js'

function comPoliticaDeConteudo(enderecoDaApi) {
  return {
    name: 'politica-de-conteudo',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: politicaDeConteudo(enderecoDaApi),
        },
        injectTo: 'head-prepend',
      },
    ],
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), comPoliticaDeConteudo(env.VITE_API_BASE_URL)],

    server: {
      proxy: {
        '/api': { target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000' },
      },
    },

    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.js',
      include: ['src/**/*.test.{js,jsx}'],
      css: false,

      env: {
        VITE_API_BASE_URL: 'http://localhost/api',
      },

      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.{js,jsx}'],
        exclude: ['src/**/*.test.{js,jsx}', 'src/test/**', 'src/main.jsx'],
      },
    },
  }
})
