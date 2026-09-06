import { Link, useLocation } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useAuth } from '../../context/AuthContext'
import { appIcons } from '../../lib/icons'
import { ROLES } from '../../lib/roles'
import './SystemPages.scss'

/**
 * Rota inexistente.
 *
 * Antes o `*` redirecionava para `/painel` em silêncio, o que confunde duas
 * coisas muito diferentes: um link digitado errado e um link para uma área que
 * a pessoa não pode ver. Agora cada caso tem sua tela — este diz que o endereço
 * não existe e oferece os destinos que o papel dela realmente alcança.
 */

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
    { to: '/painel', label: 'Painel' },
    { to: '/admin', label: 'Administração' },
  ],
  [ROLES.DEMANDANTE]: [{ to: '/painel', label: 'Painel' }],
}

export default function NaoEncontradaPage() {
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()

  const destinos = DESTINOS_POR_PAPEL[user?.role] || [{ to: '/painel', label: 'Painel' }]

  return (
    <div className="system-page">
      <div className="system-card">
        <span className="system-card__icon" aria-hidden="true">
          <FontAwesomeIcon icon={appIcons.compass} />
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
