import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useAuth } from '../context/AuthContext'
import { appIcons } from '../lib/icons'
import { ROLES, isAdministrador, roleLabel } from '../lib/roles'
import ThemeToggle from './ThemeToggle'

/**
 * Barra da área autenticada.
 *
 * Os itens dependem do papel: "Administração" só aparece para o Administrador,
 * espelhando o guard de rota em ProtectedRoute.
 *
 * Perfil e sair moram num único menu do avatar — antes eram controles soltos
 * competindo com a navegação. Os destinos que a Fase 2 ainda vai entregar (perfil
 * e configurações da conta) aparecem desabilitados e rotulados: item que some da
 * barra faz o usuário procurar; item que promete e não leva a lugar nenhum é pior.
 *
 * O alternador de tema NÃO entrou nesse menu: claro/escuro é preferência de
 * qualquer pessoa, em qualquer tela, e enterrá-lo atrás de um clique o tornaria
 * privilégio de quem sabe onde procurar. Personalizar a PALETA continua sendo
 * exclusivo do Administrador, em /admin — trocar de tema e trocar as cores da
 * organização são decisões de escopos diferentes.
 */
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

  const navItems = [
    { to: '/painel', label: 'Painel' },
    ...(ehSupervisor || ehPesquisador
      ? [{ to: '/oportunidades', label: ehSupervisor ? 'Oportunidades' : 'Minhas oportunidades' }]
      : []),
    ...(ehSupervisor ? [{ to: '/rede', label: 'Rede interna' }] : []),
    ...(ehPesquisador ? [{ to: '/perfil', label: 'Meu perfil' }] : []),
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
    navigate('/admin')
  }

  const profileMenu = (
    <div ref={profileRef} className="profile-menu" role="menu" aria-label="Menu da conta">
      <div className="profile-menu__identity">
        <span className="profile-menu__name">{profileName}</span>
        <span className="profile-menu__role">{roleLabel(user?.role)}</span>
      </div>

      <div className="profile-menu__group">
        {user?.role === ROLES.PESQUISADOR ? (
          <button
            type="button"
            className="profile-menu__item"
            role="menuitem"
            onClick={() => {
              setProfileOpen(false)
              navigate('/perfil')
            }}
          >
            <FontAwesomeIcon icon={appIcons.profile} />
            Meu Perfil
          </button>
        ) : (
          <button type="button" className="profile-menu__item" role="menuitem" disabled>
            <FontAwesomeIcon icon={appIcons.profile} />
            Meu Perfil
            <span className="profile-menu__soon">em breve</span>
          </button>
        )}

        <button type="button" className="profile-menu__item" role="menuitem" disabled>
          <FontAwesomeIcon icon={appIcons.settings} />
          Configurações
          <span className="profile-menu__soon">em breve</span>
        </button>

        {isAdministrador(user) ? (
          <button
            type="button"
            className="profile-menu__item"
            role="menuitem"
            onClick={goToAppearance}
          >
            <FontAwesomeIcon icon={appIcons.appearance} />
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
          <FontAwesomeIcon icon={appIcons.logout} />
          Sair
        </button>
      </div>
    </div>
  )

  return (
    <header className="auth-nav">
      <div className="container auth-nav__inner">
        <div className="auth-nav__brand">
          <div className="logo-icon">AC2</div>
          <div className="auth-nav__brand-title">P&amp;D Connect</div>
        </div>

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
            <FontAwesomeIcon
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
            <span className="auth-nav__drawer-profile" data-initial={profileInitial}>
              <span className="auth-nav__drawer-profile-name">{profileName}</span>
            </span>

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
