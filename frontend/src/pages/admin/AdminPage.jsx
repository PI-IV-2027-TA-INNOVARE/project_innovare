import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../../lib/icons'
import AppearanceSection from './sections/AppearanceSection'
import UsersSection from './sections/UsersSection'
import './AdminPage.scss'

/**
 * Console do Administrador.
 *
 * Escopo do ator (baseline de atores v1.0): contas, acessos, permissões e
 * configurações da plataforma. Não substitui as atribuições científicas e
 * decisórias do Supervisor.
 *
 * A barra lateral desenha os destinos; cada seção continua responsável pelo
 * próprio conteúdo e pelo próprio portão. Item ausente da barra é ergonomia,
 * não segurança — ver PLANO_IMPLEMENTACAO.md §4.3.
 */

const SECTIONS = [
  {
    id: 'aparencia',
    label: 'Aparência',
    description: 'Cores e identidade visual',
    icon: appIcons.appearance,
    Component: AppearanceSection,
  },
  {
    id: 'usuarios',
    label: 'Usuários',
    description: 'Contas, perfis e acessos',
    icon: appIcons.users,
    Component: UsersSection,
  },
]

export default function AdminPage() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id)

  const active = SECTIONS.find((section) => section.id === activeId) || SECTIONS[0]
  const ActiveComponent = active.Component

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
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`admin-nav__item${section.id === activeId ? ' is-active' : ''}`}
              onClick={() => setActiveId(section.id)}
              aria-current={section.id === activeId ? 'page' : undefined}
            >
              <FontAwesomeIcon icon={section.icon} className="admin-nav__icon" />

              <span className="admin-nav__text">
                <span className="admin-nav__label">{section.label}</span>
                <span className="admin-nav__description">{section.description}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="admin-content">
          <ActiveComponent />
        </div>
      </div>
    </div>
  )
}
