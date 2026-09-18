import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { podeVer } from '../../lib/permissoes'

export default function SecaoProtegida({ permissao, children }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!podeVer(user, permissao)) {
    return <Navigate to="/sem-acesso" replace state={{ from: location.pathname }} />
  }

  return children
}
