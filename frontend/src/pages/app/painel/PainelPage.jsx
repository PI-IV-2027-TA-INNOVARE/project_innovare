import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { Icone, appIcons } from '../../../lib/icons'
import { ROLES, roleDescription } from '../../../lib/roles'
import PainelPorPapel from './PainelPorPapel'
import './PainelPage.scss'

function DemoNotice() {
  const [visivel, setVisivel] = useState(true)
  const [detalhesAbertos, setDetalhesAbertos] = useState(false)

  if (!visivel) return null

  return (
    <div className="painel__notice" role="note">
      <Icone icon={appIcons.warning} className="painel__notice-icon" />

      <div className="painel__notice-body">
        <strong>Ambiente de demonstração</strong>
        <p>Dados fictícios, sem persistência. Nada do que você fizer aqui é salvo.</p>

        <button
          type="button"
          className="painel__notice-toggle"
          aria-expanded={detalhesAbertos}
          onClick={() => setDetalhesAbertos((aberto) => !aberto)}
        >
          {detalhesAbertos ? 'Ocultar detalhes técnicos' : 'Ver detalhes técnicos'}
        </button>

        {detalhesAbertos ? (
          <p className="painel__notice-detail">
            A autenticação fictícia é ligada por <code>VITE_AUTH_MOCK=true</code> no{' '}
            <code>.env</code> do frontend. Troque para <code>false</code> para
            autenticar contra a API real.
          </p>
        ) : null}
      </div>

      <button
        type="button"
        className="painel__notice-close"
        onClick={() => setVisivel(false)}
        title="Fechar aviso"
        aria-label="Fechar aviso"
      >
        <Icone icon={appIcons.clear} />
      </button>
    </div>
  )
}

export default function PainelPage() {
  const { user, isMockAuth } = useAuth()

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

      {isMockAuth ? <DemoNotice /> : null}

      <div className="console painel__papel">
        <PainelPorPapel user={user} />
      </div>

    </div>
  )
}
