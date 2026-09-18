import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Icone, appIcons } from '../lib/icons'
import { ROLES, isAdministrador, roleLabel } from '../lib/roles'
import { rotaInicialDe } from '../lib/rotas'
import ThemeToggle from './ThemeToggle'

export default function AuthNav() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const menuRef = useRef(null)
  const hamburgerRef = useRef(null)
  const profileRef = useRef(null)
  const profileTriggerRef = useRef(null)

  const ehSupervisor = user?.role === ROLES.SUPERVISOR
  const ehPesquisador = user?.role === ROLES.PESQUISADOR
  const ehDemandante = user?.role === ROLES.DEMANDANTE

  const navItems = [
    ...(isAdministrador(user) ? [] : [{ to: '/painel', label: 'Painel' }]),
    ...(ehSupervisor || ehPesquisador
      ? [{ to: '/oportunidades', label: ehSupervisor ? 'Oportunidades' : 'Minhas oportunidades' }]
      : []),
    ...(ehDemandante ? [{ to: '/problemas', label: 'Meus problemas' }] : []),
    ...(ehSupervisor ? [{ to: '/rede', label: 'Rede interna' }] : []),
    ...(isAdministrador(user) ? [{ to: '/admin', label: 'Administração' }] : []),
  ]

  const profileName = user?.displayName || 'Perfil sem nome'
  const profileInitial = profileName.trim().charAt(0).toUpperCase() || 'U'

  useEffect(() => {
    setMenuOpen(false)
    setProfileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen && !profileOpen) return undefined

    const isOutside = (containerRef, triggerRef, target) =>
      containerRef.current && !containerRef.current.contains(target) &&
      triggerRef.current && !triggerRef.current.contains(target)

    const onPointerDown = (event) => {
      if (menuOpen && isOutside(menuRef, hamburgerRef, event.target)) {
        setMenuOpen(false)
      }

      if (profileOpen && isOutside(profileRef, profileTriggerRef, event.target)) {
        setProfileOpen(false)
      }
    }

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return

      setMenuOpen(false)

      if (profileOpen) {
        setProfileOpen(false)
        profileTriggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen, profileOpen])

  const handleLogout = () => {
    setMenuOpen(false)
    setProfileOpen(false)
    logout()
  }

  const goToAppearance = () => {
    setProfileOpen(false)
    navigate('/admin/aparencia')
  }

  const profileMenu = (
    <div ref={profileRef} className="profile-menu" role="menu" aria-label="Menu da conta">
      <div className="profile-menu__identity">
        <span className="profile-menu__name">{profileName}</span>
        <span className="profile-menu__role">{roleLabel(user?.role)}</span>
      </div>

      <div className="profile-menu__group">
        <button
          type="button"
          className="profile-menu__item"
          role="menuitem"
          onClick={() => {
            setProfileOpen(false)
            navigate('/perfil')
          }}
        >
          <Icone icon={appIcons.profile} />
          Meu perfil
        </button>

        {isAdministrador(user) ? (
          <button
            type="button"
            className="profile-menu__item"
            role="menuitem"
            onClick={goToAppearance}
          >
            <Icone icon={appIcons.appearance} />
            Aparência
          </button>
        ) : null}
      </div>

      <div className="profile-menu__group">
        <button
          type="button"
          className="profile-menu__item profile-menu__item--danger"
          role="menuitem"
          onClick={handleLogout}
        >
          <Icone icon={appIcons.logout} />
          Sair
        </button>
      </div>
    </div>
  )

  return (
    <header className="auth-nav">
      <div className="container auth-nav__inner">
        <Link className="auth-nav__brand" to={rotaInicialDe(user?.role)}>
          <span className="logo-icon">AC2</span>
          <span className="auth-nav__brand-title">P&amp;D Connect</span>
          <span className="sr-only">Ir para o painel</span>
        </Link>

        <nav className="auth-nav__links" aria-label="Navegação autenticada">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `auth-nav__link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="auth-nav__profile">
          <ThemeToggle />

          <button
            ref={profileTriggerRef}
            type="button"
            className="auth-nav__profile-text"
            data-initial={profileInitial}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((open) => !open)}
          >
            <span className="auth-nav__profile-name" title={profileName}>{profileName}</span>
            <Icone
              icon={appIcons.disclosure}
              className={`auth-nav__profile-chevron${profileOpen ? ' is-open' : ''}`}
            />
          </button>

          {profileOpen ? profileMenu : null}
        </div>

        <div className="auth-nav__mobile-right">
          <button
            ref={hamburgerRef}
            type="button"
            className={`auth-nav__hamburger${menuOpen ? ' active' : ''}`}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div ref={menuRef} className="auth-nav__drawer" role="dialog" aria-label="Menu de navegação">
          <nav className="auth-nav__drawer-links">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `auth-nav__drawer-link${isActive ? ' active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="auth-nav__drawer-footer">
            <Link
              className="auth-nav__drawer-profile"
              to="/perfil"
              data-initial={profileInitial}
            >
              <span className="auth-nav__drawer-profile-name">{profileName}</span>
            </Link>

            <div className="auth-nav__drawer-actions">
              <ThemeToggle />
              <button type="button" className="btn btn-ghost auth-nav__logout" onClick={handleLogout}>
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
