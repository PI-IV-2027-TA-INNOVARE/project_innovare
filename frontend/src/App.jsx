import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ScrollToTop from './components/ScrollToTop'
import ProtectedRoute from './components/ProtectedRoute'
import AuthenticatedLayout from './components/AuthenticatedLayout'
import LoginPage from './pages/auth/login'
import { ROLES } from './lib/roles'

// Code-splitting: so o login entra no bundle inicial. As telas autenticadas
// (e o painel de admin, o maior deles) sao carregadas sob demanda.
const PainelPage = lazy(() => import('./pages/app/painel'))
const PerfilPage = lazy(() => import('./pages/app/perfil'))
const OportunidadesPage = lazy(() => import('./pages/app/oportunidades'))
const OportunidadePage = lazy(() => import('./pages/app/oportunidades/detalhe'))
const AcessoRestritoPage = lazy(() => import('./pages/system'))
const NaoEncontradaPage = lazy(() => import('./pages/system/naoEncontrada'))
const RedePage = lazy(() => import('./pages/app/rede'))
const RedeFormPage = lazy(() => import('./pages/app/rede/form'))
const AdminPage = lazy(() => import('./pages/admin'))
const ForgotPasswordPage = lazy(() => import('./pages/auth/forgot-password'))
const ResetPasswordPage = lazy(() => import('./pages/auth/reset-password'))

function RouteFallback() {
  return (
    <section className="route-state">
      <div className="container route-state__container">
        <div className="route-state__loader" role="status" aria-live="polite">
          <span className="route-state__spinner" aria-hidden="true" />
          <span className="sr-only">Carregando</span>
        </div>
      </div>
    </section>
  )
}

function App() {
  return (
    <>
      <ScrollToTop />

      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Publicas — o P&D Connect nao tem landing: a porta de entrada e o login. */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/esqueci-minha-senha" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Autenticadas */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AuthenticatedLayout />}>
              <Route path="/painel" element={<PainelPage />} />
              <Route path="/sem-acesso" element={<AcessoRestritoPage />} />
            </Route>
          </Route>

          {/*
            Oportunidades: dois atores, uma leitura. O Supervisor conduz a fila;
            o Pesquisador acompanha aquelas em que integra a equipe potencial
            (D02). O Demandante acompanha os PROPRIOS problemas em /problemas, e
            o Administrador nao substitui as atribuicoes cientificas do
            Supervisor (CONTEXT.md §3) — nenhum dos dois entra aqui.
          */}
          <Route element={<ProtectedRoute requiredRole={[ROLES.SUPERVISOR, ROLES.PESQUISADOR]} />}>
            <Route element={<AuthenticatedLayout />}>
              <Route path="/oportunidades" element={<OportunidadesPage />} />
              <Route path="/oportunidades/:id" element={<OportunidadePage />} />
            </Route>
          </Route>

          {/* Pesquisador — mantem o proprio perfil profissional (RN-A05) */}
          <Route element={<ProtectedRoute requiredRole={ROLES.PESQUISADOR} />}>
            <Route element={<AuthenticatedLayout />}>
              <Route path="/perfil" element={<PerfilPage />} />
            </Route>
          </Route>

          {/* Supervisor — cadastra e gere a rede interna (RF02, RN-A04 / D06) */}
          <Route element={<ProtectedRoute requiredRole={ROLES.SUPERVISOR} />}>
            <Route element={<AuthenticatedLayout />}>
              <Route path="/rede" element={<RedePage />} />
              <Route path="/rede/novo" element={<RedeFormPage />} />
              <Route path="/rede/:id" element={<RedeFormPage />} />
            </Route>
          </Route>

          {/* Exclusivas do Administrador */}
          <Route element={<ProtectedRoute requiredRole={ROLES.ADMINISTRADOR} />}>
            <Route element={<AuthenticatedLayout />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/painel" replace />} />
          <Route path="*" element={<NaoEncontradaPage />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default App
