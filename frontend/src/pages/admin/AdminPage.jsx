import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useAuth } from '../../context/AuthContext'
import { podeVer } from '../../lib/permissoes'
import { SECOES_ADMIN } from './secoes'
import './AdminPage.scss'

function SecaoCarregando() {
  return (
    <div className="route-state__loader" role="status" aria-live="polite">
      <span className="route-state__spinner" aria-hidden="true" />
      <span className="sr-only">Carregando seção</span>
    </div>
  )
}

export default function AdminPage() {
  const { user } = useAuth()

  const visiveis = SECOES_ADMIN.filter((secao) => podeVer(user, secao.permissao))

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <p className="admin-page__breadcrumb">
          AC2 Microbiologia <span aria-hidden="true">·</span> Núcleo de P&amp;D
        </p>

        <h1 className="admin-page__title">Administração</h1>

        <p className="admin-page__description">
          Configurações da plataforma P&amp;D Connect: identidade visual, contas e
          níveis de acesso.
        </p>
      </header>

      <div className="admin-page__body">
        <nav className="admin-nav" aria-label="Seções da administração">
          {visiveis.map((secao) => (
            <NavLink
              key={secao.id}
              to={secao.rota}
              className={({ isActive }) => `admin-nav__item${isActive ? ' is-active' : ''}`}
            >
              <FontAwesomeIcon icon={secao.icon} className="admin-nav__icon" />

              <span className="admin-nav__text">
                <span className="admin-nav__label">{secao.label}</span>
                <span className="admin-nav__description">{secao.description}</span>
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-content">
          <Suspense fallback={<SecaoCarregando />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
