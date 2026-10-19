import { Navigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { ROLES, roleDescription } from '../../../lib/roles'
import PainelPorPapel from './PainelPorPapel'
import './PainelPage.scss'

export default function PainelPage() {
  const { user } = useAuth()

  if (user?.role === ROLES.ADMINISTRADOR) {
    return <Navigate to="/admin" replace />
  }

  return (
    <div className="painel">
      <header className="painel__header">
        <p className="painel__eyebrow">AC2 Microbiologia · Núcleo de P&amp;D</p>
        <h1 className="painel__title">
          Olá, {user?.displayName || 'usuário'}
        </h1>
        <p className="painel__role">
          <span className="painel__role-tag">{user?.roleLabel}</span>
          {roleDescription(user?.role)}
        </p>
      </header>

      <div className="console painel__papel">
        <PainelPorPapel user={user} />
      </div>

    </div>
  )
}
