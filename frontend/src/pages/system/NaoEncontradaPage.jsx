import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Icone, appIcons } from '../../lib/icons'
import { ROLES } from '../../lib/roles'
import './SystemPages.scss'

const DESTINOS_POR_PAPEL = {
  [ROLES.SUPERVISOR]: [
    { to: '/painel', label: 'Painel' },
    { to: '/oportunidades', label: 'Oportunidades' },
    { to: '/rede', label: 'Rede interna' },
  ],
  [ROLES.PESQUISADOR]: [
    { to: '/painel', label: 'Painel' },
    { to: '/oportunidades', label: 'Minhas oportunidades' },
    { to: '/perfil', label: 'Meu perfil' },
  ],
  [ROLES.ADMINISTRADOR]: [
    { to: '/admin', label: 'Administração' },
    { to: '/perfil', label: 'Minha conta' },
  ],
  [ROLES.DEMANDANTE]: [
    { to: '/painel', label: 'Painel' },
    { to: '/problemas', label: 'Meus problemas' },
  ],
}

export default function NaoEncontradaPage() {
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()

  const destinos = DESTINOS_POR_PAPEL[user?.role] || [{ to: '/painel', label: 'Painel' }]

  return (
    <div className="system-page">
      <div className="system-card">
        <span className="system-card__icon" aria-hidden="true">
          <Icone icon={appIcons.compass} />
        </span>

        <p className="system-card__code">404</p>
        <h1 className="system-card__title">Endereço não encontrado</h1>

        <p className="system-card__text">
          Não existe nada em <code>{location.pathname}</code>. O link pode ter
          mudado, ou o endereço foi digitado com um caractere a mais.
        </p>

        {isAuthenticated ? (
          <>
            <p className="system-card__text">Daqui você chega a:</p>

            <div className="system-destinos">
              {destinos.map((destino) => (
                <Link key={destino.to} className="admin-btn admin-btn--outline" to={destino.to}>
                  {destino.label}
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="system-card__acoes">
            <Link className="admin-btn" to="/login">Ir para o login</Link>
          </div>
        )}
      </div>
    </div>
  )
}
