import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { BrandingProvider } from './context/BrandingContext'
import './styles/index.scss'

// Pinta o tema antes do React montar, para nao piscar claro no primeiro frame.
// A regra tem de ser a MESMA de `getStoredTheme()` em ThemeContext.jsx:
// preferencia salva > preferencia do sistema > claro.
const storedTheme = window.localStorage.getItem('pdconnect.theme')
const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
const initialTheme = storedTheme === 'dark' || storedTheme === 'light'
  ? storedTheme
  : (prefersDark ? 'dark' : 'light')

document.documentElement.dataset.theme = initialTheme
document.documentElement.style.colorScheme = initialTheme

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrandingProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </BrandingProvider>
    </ThemeProvider>
  </React.StrictMode>
)
