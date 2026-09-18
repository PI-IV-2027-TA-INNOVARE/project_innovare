import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ScrollToTop from './components/ScrollToTop'
import ProtectedRoute from './components/ProtectedRoute'
import AuthenticatedLayout from './components/AuthenticatedLayout'
import LoginPage from './pages/auth/login'
import SecaoProtegida from './components/console/SecaoProtegida'
import { useAuth } from './context/AuthContext'
import { PERMISSOES } from './lib/permissoes'
import { PAPEIS, rotaInicialDe } from './lib/rotas'
import { SECAO_INICIAL } from './pages/admin/secoes'

const PainelPage = lazy(() => import('./pages/app/painel'))
const PerfilPage = lazy(() => import('./pages/app/perfil'))
const OportunidadesPage = lazy(() => import('./pages/app/oportunidades'))
const OportunidadePage = lazy(() => import('./pages/app/oportunidades/detalhe'))
const IdeiaFormPage = lazy(() => import('./pages/app/oportunidades/nova'))
const ProblemasPage = lazy(() => import('./pages/app/problemas'))
const ProblemaFormPage = lazy(() => import('./pages/app/problemas/novo'))
const ProblemaPage = lazy(() => import('./pages/app/problemas/detalhe'))
const AcessoRestritoPage = lazy(() => import('./pages/system'))
const NaoEncontradaPage = lazy(() => import('./pages/system/naoEncontrada'))
const RedePage = lazy(() => import('./pages/app/rede'))
const RedeFormPage = lazy(() => import('./pages/app/rede/form'))
const AdminPage = lazy(() => import('./pages/admin'))
const AppearanceSection = lazy(() => import('./pages/admin/sections/AppearanceSection'))
const UsersSection = lazy(() => import('./pages/admin/sections/UsersSection'))
const ParametrosSection = lazy(() => import('./pages/admin/sections/ParametrosSection'))
const ForgotPasswordPage = lazy(() => import('./pages/auth/forgot-password'))
const ResetPasswordPage = lazy(() => import('./pages/auth/reset-password'))

function RotaInicial() {
  const { user } = useAuth()

  return <Navigate to={rotaInicialDe(user?.role)} replace />
}

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
          <Route path="/login" element={<LoginPage />} />
          <Route path="/esqueci-minha-senha" element={<ForgotPasswordPage />} />
          <Route path="/definir-senha" element={<ResetPasswordPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AuthenticatedLayout />}>
              <Route path="/painel" element={<PainelPage />} />
              <Route path="/perfil" element={<PerfilPage />} />
              <Route path="/sem-acesso" element={<AcessoRestritoPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute requiredRole={PAPEIS.IDEIA_INTERNA} />}>
            <Route element={<AuthenticatedLayout />}>
              <Route path="/oportunidades/nova" element={<IdeiaFormPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute requiredRole={PAPEIS.OPORTUNIDADES} />}>
            <Route element={<AuthenticatedLayout />}>
              <Route path="/oportunidades" element={<OportunidadesPage />} />
              <Route path="/oportunidades/:id" element={<OportunidadePage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute requiredRole={PAPEIS.PROBLEMAS} />}>
            <Route element={<AuthenticatedLayout />}>
              <Route path="/problemas" element={<ProblemasPage />} />
              <Route path="/problemas/novo" element={<ProblemaFormPage />} />
              <Route path="/problemas/:id" element={<ProblemaPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute requiredRole={PAPEIS.REDE} />}>
            <Route element={<AuthenticatedLayout />}>
              <Route path="/rede" element={<RedePage />} />
              <Route path="/rede/novo" element={<RedeFormPage />} />
              <Route path="/rede/:id" element={<RedeFormPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute requiredRole={PAPEIS.ADMIN} />}>
            <Route element={<AuthenticatedLayout />}>
              <Route path="/admin" element={<AdminPage />}>
                <Route index element={<Navigate to={SECAO_INICIAL.rota} replace />} />

                <Route
                  path="aparencia"
                  element={
                    <SecaoProtegida permissao={PERMISSOES.CONFIGURACAO}>
                      <AppearanceSection />
                    </SecaoProtegida>
                  }
                />
                <Route
                  path="usuarios"
                  element={
                    <SecaoProtegida permissao={PERMISSOES.CONTAS}>
                      <UsersSection />
                    </SecaoProtegida>
                  }
                />
                <Route
                  path="parametros"
                  element={
                    <SecaoProtegida permissao={PERMISSOES.CONFIGURACAO}>
                      <ParametrosSection />
                    </SecaoProtegida>
                  }
                />
              </Route>
            </Route>
          </Route>

          <Route path="/" element={<RotaInicial />} />
          <Route path="*" element={<NaoEncontradaPage />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default App
