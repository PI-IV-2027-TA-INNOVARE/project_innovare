import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { roleLabel } from '../../lib/roles'
import { rotaInicialDe, rotuloDoInicio } from '../../lib/rotas'
import { lerContatosSuporte } from '../../services/pdConnectApi'
import './SystemPages.scss'

export default function AcessoRestritoPage() {
  const { user } = useAuth()
  const location = useLocation()
  const [contatos, setContatos] = useState([])
  const [falhou, setFalhou] = useState(false)

  const rotaTentada = location.state?.from

  useEffect(() => {
    let ativo = true

    lerContatosSuporte()
      .then((lista) => {
        if (ativo) setContatos(lista)
      })
      .catch(() => {
        if (ativo) setFalhou(true)
      })

    return () => {
      ativo = false
    }
  }, [])

  return (
    <div className="system-page">
      <div className="system-card">
        <p className="system-card__code">403</p>
        <h1 className="system-card__title">Acesso não autorizado</h1>

        <p className="system-card__text">
          {rotaTentada ? (
            <>
              A página <code>{rotaTentada}</code> não está disponível para o seu perfil.
            </>
          ) : (
            'Esta página não está disponível para o seu perfil.'
          )}{' '}
          Se você precisa dela para o seu trabalho, fale com o Núcleo de P&amp;D da
          AC2 por um dos contatos abaixo.
        </p>

        <p className="system-card__role">
          Você entrou como <strong>{user?.displayName || 'usuário'}</strong>
          {user?.role ? (
            <>
              {' '}· <span className="admin-tag">{roleLabel(user.role)}</span>
            </>
          ) : null}
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

        {falhou ? (
          <p className="system-card__text" role="alert">
            Não foi possível carregar os contatos agora. Tente novamente em instantes.
          </p>
        ) : null}

        <div className="system-card__acoes">
          <Link className="admin-btn" to={rotaInicialDe(user?.role)}>
            {rotuloDoInicio(user?.role)}
          </Link>
        </div>
      </div>
    </div>
  )
}
