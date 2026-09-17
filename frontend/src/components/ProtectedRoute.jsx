import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ requiredRole = null }) {
  const { isAuthenticated, isBootstrapping, user } = useAuth()
  const location = useLocation()

  if (isBootstrapping) {
    return (
      <section className="route-state">
        <div className="container route-state__container">
          <div className="route-state__loader" role="status" aria-live="polite">
            <span className="route-state__spinner" aria-hidden="true" />
            <span className="sr-only">Carregando área autenticada</span>
          </div>
        </div>
      </section>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const papeisPermitidos = requiredRole
    ? (Array.isArray(requiredRole) ? requiredRole : [requiredRole])
    : null

  if (papeisPermitidos && !papeisPermitidos.includes(user?.role)) {
    return <Navigate to="/sem-acesso" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
