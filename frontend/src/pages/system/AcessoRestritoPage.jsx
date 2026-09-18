import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Icone, appIcons } from '../../lib/icons'
import { roleLabel } from '../../lib/roles'
import { lerContatos } from './contatosSuporte'
import './SystemPages.scss'

export default function AcessoRestritoPage() {
  const { user } = useAuth()
  const location = useLocation()

  const rotaTentada = location.state?.from
  const contatos = lerContatos()

  return (
    <div className="system-page">
      <div className="system-card">
        <span className="system-card__icon system-card__icon--lock" aria-hidden="true">
          <Icone icon={appIcons.lock} />
        </span>

        <h1 className="system-card__title">Acesso restrito</h1>

        <p className="system-card__text">
          {rotaTentada ? (
            <>
              A página <code>{rotaTentada}</code> não faz parte do que o seu
              perfil alcança.
            </>
          ) : (
            'Esta página não faz parte do que o seu perfil alcança.'
          )}
        </p>

        <p className="system-card__role">
          Você está autenticado como{' '}
          <strong>{user?.displayName || 'usuário'}</strong>
          {user?.role ? (
            <>
              {' '}· <span className="admin-tag">{roleLabel(user.role)}</span>
            </>
          ) : null}
        </p>

        <p className="system-card__text">
          O acesso é concedido pelo Núcleo de P&amp;D da AC2. Se você precisa desta
          área para o seu trabalho, fale com um dos contatos abaixo.
        </p>

        <ul className="system-contatos">
          {contatos.map((contato) => (
            <li key={contato.email}>
              <span className="system-contatos__nome">{contato.nome}</span>
              <a className="system-contatos__email" href={`mailto:${contato.email}`}>
                {contato.email}
              </a>
              <span className="system-contatos__papel">{contato.papel}</span>
            </li>
          ))}
        </ul>

        <div className="system-card__acoes">
          <Link className="admin-btn" to="/painel">Voltar ao painel</Link>
        </div>
      </div>
    </div>
  )
}
