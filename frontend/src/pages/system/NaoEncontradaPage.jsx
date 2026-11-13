import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Icone, appIcons } from '../../lib/icons'
import { ROLES } from '../../lib/roles'
import { rotaInicialDe } from '../../lib/rotas'
import './SystemPages.scss'

const DESTINOS_POR_PAPEL = {
  [ROLES.SUPERVISOR]: [
    { to: '/painel', label: 'Painel' },
    { to: '/oportunidades', label: 'Oportunidades' },
    { to: '/rede', label: 'Rede interna' },
    { to: '/indicadores', label: 'Indicadores' },
  ],
  [ROLES.PESQUISADOR]: [
    { to: '/painel', label: 'Painel' },
    { to: '/oportunidades', label: 'Minhas oportunidades' },
    { to: '/perfil', label: 'Meu perfil' },
    { to: '/indicadores', label: 'Indicadores' },
  ],
  [ROLES.ADMINISTRADOR]: [
    { to: '/admin', label: 'Administração' },
    { to: '/perfil', label: 'Minha conta' },
  ],
  [ROLES.DEMANDANTE]: [
    { to: '/painel', label: 'Painel' },
    { to: '/problemas', label: 'Meus problemas' },
    { to: '/indicadores', label: 'Indicadores' },
  ],
}

const TEXTO_PADRAO =
  'Não encontramos a página que você está tentando acessar. O endereço pode estar incorreto ou a página pode não existir mais.'

const comInicialMinuscula = (texto) => texto.charAt(0).toLowerCase() + texto.slice(1)

function voltaPelaSecao(caminho, destinos) {
  const secao = destinos.find(
    (destino) => caminho === destino.to || caminho.startsWith(`${destino.to}/`),
  )

  return secao ? { to: secao.to, label: `Voltar para ${comInicialMinuscula(secao.label)}` } : null
}

export default function NaoEncontradaPage({ titulo = 'Página não encontrada', texto = TEXTO_PADRAO, voltar }) {
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()

  const inicio = rotaInicialDe(user?.role)
  const rotuloDoInicio =
    user?.role === ROLES.ADMINISTRADOR ? 'Ir para a administração' : 'Ir para o painel'
  const volta = voltar || voltaPelaSecao(location.pathname, DESTINOS_POR_PAPEL[user?.role] || [])
  const temVolta = Boolean(volta) && volta.to !== inicio

  return (
    <div className="system-page">
      <div className="system-card">
        <p className="system-card__code">404</p>
        <h1 className="system-card__title">{titulo}</h1>

        <p className="system-card__text">{texto}</p>

        {isAuthenticated ? (
          <div className="system-card__acoes">
            {temVolta ? (
              <Link className="admin-btn" to={volta.to}>
                <Icone icon={appIcons.back} />
                {volta.label}
              </Link>
            ) : null}
            <Link
              className={temVolta ? 'admin-btn admin-btn--outline' : 'admin-btn'}
              to={inicio}
            >
              {rotuloDoInicio}
            </Link>
          </div>
        ) : (
          <div className="system-card__acoes">
            <Link className="admin-btn" to="/login">Ir para o login</Link>
          </div>
        )}
      </div>
    </div>
  )
}
