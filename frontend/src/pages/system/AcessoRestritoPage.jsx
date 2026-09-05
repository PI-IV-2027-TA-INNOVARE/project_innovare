import { Link, useLocation } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useAuth } from '../../context/AuthContext'
import { appIcons } from '../../lib/icons'
import { roleLabel } from '../../lib/roles'
import { CONTATOS_SUPORTE } from './contatosSuporte'
import './SystemPages.scss'

/**
 * Acesso restrito.
 *
 * Quem está autenticado mas não tem permissão para a rota chega aqui, e não a um
 * redirecionamento silencioso para o Painel — mandar a pessoa para outro lugar
 * sem explicar transforma "você não tem acesso" em "o link está quebrado", e o
 * chamado que chega depois é sobre a coisa errada.
 *
 * A tela diz três coisas: qual é o papel dela, o que aquele papel alcança e com
 * quem falar. Os contatos virão do Console → Parâmetros quando ele existir
 * (PLANO_IMPLEMENTACAO.md §6.5).
 */
export default function AcessoRestritoPage() {
  const { user } = useAuth()
  const location = useLocation()

  const rotaTentada = location.state?.from

  return (
    <div className="system-page">
      <div className="system-card">
        <span className="system-card__icon system-card__icon--lock" aria-hidden="true">
          <FontAwesomeIcon icon={appIcons.lock} />
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
          {CONTATOS_SUPORTE.map((contato) => (
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
