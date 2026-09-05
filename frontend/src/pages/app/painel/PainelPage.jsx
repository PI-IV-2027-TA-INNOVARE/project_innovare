import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useAuth } from '../../../context/AuthContext'
import { appIcons } from '../../../lib/icons'
import { ROLES, roleDescription } from '../../../lib/roles'
import PainelPorPapel from './PainelPorPapel'
import './PainelPage.scss'

/**
 * Painel inicial da área autenticada.
 *
 * Serve como ponto de entrada e mapa do que vem pela frente. As etapas do fluxo
 * de valor são a Fase 3 do PLANO_IMPLEMENTACAO.md e aparecem marcadas como
 * planejadas — o que está pronto e o que ainda não está precisam se distinguir
 * à primeira vista, ou o usuário tenta clicar no que não existe.
 */

const ETAPAS = [
  {
    id: 'oportunidade',
    titulo: 'Oportunidade',
    descricao: 'Problema externo ou ideia interna registrado e acompanhado.',
  },
  {
    id: 'copiloto',
    titulo: 'Copiloto IA',
    descricao: 'Estruturação assistida da proposta, com revisão humana obrigatória.',
  },
  {
    id: 'matching',
    titulo: 'Competências e Matching',
    descricao: 'Equipe potencial a partir da rede interna da AC2, com lacunas.',
  },
  {
    id: 'pre-analise',
    titulo: 'Pré-análise PIPE/FAPESP',
    descricao: 'Maturidade por dimensão, lacunas e recomendações. Caráter orientativo.',
  },
  {
    id: 'decisao',
    titulo: 'Decisão do Supervisor',
    descricao: 'Continuar, revisar ou arquivar — sempre decisão humana.',
  },
]

function DemoNotice() {
  const [visivel, setVisivel] = useState(true)
  const [detalhesAbertos, setDetalhesAbertos] = useState(false)

  if (!visivel) return null

  return (
    <div className="painel__notice" role="note">
      <FontAwesomeIcon icon={appIcons.warning} className="painel__notice-icon" />

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
        <FontAwesomeIcon icon={appIcons.clear} />
      </button>
    </div>
  )
}

export default function PainelPage() {
  const { user, isMockAuth } = useAuth()

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

      {/*
        Conteúdo próprio de cada ator. O painel responde a uma pergunta só —
        "o que espera por mim agora?" — e a resposta é diferente por papel.
      */}
      <div className="console painel__papel">
        <PainelPorPapel user={user} />
      </div>

      {user?.role === ROLES.ADMINISTRADOR ? (
        <section className="painel__modules" aria-label="Módulos administrativos">
          <h2 className="painel__section-title">Módulos administrativos</h2>

          <div className="painel__module-grid">
            <article className="module-card">
              <FontAwesomeIcon icon={appIcons.settings} className="module-card__icon" />
              <h3 className="module-card__title">Gestão de contas e identidade visual</h3>
              <p className="module-card__text">
                Gerencie contas, acessos e a identidade visual da plataforma.
              </p>
              <Link className="module-card__link" to="/admin">Abrir painel</Link>
            </article>
          </div>
        </section>
      ) : null}

      <section className="painel__roadmap" aria-label="Fluxo do P&D Connect">
        <h2 className="painel__section-title">Fluxo de valor do P&amp;D Connect</h2>
        <p className="painel__section-subtitle">
          Da entrada da oportunidade até a decisão. Os módulos abaixo entram nas
          próximas fases de implementação.
        </p>

        <ol className="painel__steps">
          {ETAPAS.map((etapa, index) => (
            <li className="painel-step" key={etapa.id}>
              <span className="painel-step__index" aria-hidden="true">{index + 1}</span>

              <div className="painel-step__body">
                <h3 className="painel-step__title">{etapa.titulo}</h3>
                <p className="painel-step__description">{etapa.descricao}</p>
              </div>

              <span className="painel-step__badge">Planejado</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
