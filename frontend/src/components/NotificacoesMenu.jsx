import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Icone, appIcons } from '../lib/icons'
import { formatarUltimoAcesso } from '../lib/people'
import { rotaDaEntidade } from '../lib/rotas'
import {
  contarNotificacoesNaoLidas,
  listarNotificacoes,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas,
} from '../services/pdConnectApi'

const FALHA_NA_CAIXA = 'Não foi possível carregar as notificações.'

function Aviso({ notificacao, destino, onAbrir }) {
  const naoLida = !notificacao.lida_em

  const conteudo = (
    <>
      <span className="notificacoes__aviso-titulo">{notificacao.titulo}</span>
      <span className="notificacoes__aviso-mensagem">{notificacao.mensagem}</span>
      <span className="notificacoes__aviso-quando">
        {formatarUltimoAcesso(new Date(notificacao.criado_em).getTime())}
      </span>
    </>
  )

  return (
    <li
      className="notificacoes__aviso"
      aria-label={notificacao.titulo}
      data-nao-lida={String(naoLida)}
    >
      {destino ? (
        <Link className="notificacoes__aviso-corpo" to={destino} onClick={onAbrir}>
          {conteudo}
        </Link>
      ) : (
        <div className="notificacoes__aviso-corpo">{conteudo}</div>
      )}
    </li>
  )
}

export default function NotificacoesMenu() {
  const { user } = useAuth()

  const [aberto, setAberto] = useState(false)
  const [naoLidas, setNaoLidas] = useState(0)
  const [avisos, setAvisos] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const painelRef = useRef(null)
  const gatilhoRef = useRef(null)

  useEffect(() => {
    let ativo = true

    contarNotificacoesNaoLidas()
      .then((resposta) => {
        if (ativo) setNaoLidas(resposta.total || 0)
      })
      .catch(() => {
        if (ativo) setNaoLidas(0)
      })

    return () => {
      ativo = false
    }
  }, [])

  useEffect(() => {
    if (!aberto) return undefined

    let ativo = true
    setCarregando(true)

    listarNotificacoes()
      .then((resposta) => {
        if (!ativo) return
        setAvisos(resposta.results || [])
        setErro('')
      })
      .catch(() => {
        if (ativo) setErro(FALHA_NA_CAIXA)
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [aberto])

  useEffect(() => {
    if (!aberto) return undefined

    const onPointerDown = (evento) => {
      const foraDoPainel =
        painelRef.current && !painelRef.current.contains(evento.target)
      const foraDoGatilho =
        gatilhoRef.current && !gatilhoRef.current.contains(evento.target)

      if (foraDoPainel && foraDoGatilho) setAberto(false)
    }

    const onKeyDown = (evento) => {
      if (evento.key !== 'Escape') return

      setAberto(false)
      gatilhoRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [aberto])

  const carimbar = (id, lidaEm) =>
    setAvisos((atuais) =>
      atuais.map((item) =>
        item.id_notificacao === id ? { ...item, lida_em: lidaEm } : item
      )
    )

  const abrirAviso = (notificacao) => {
    setAberto(false)

    if (notificacao.lida_em) return

    carimbar(notificacao.id_notificacao, new Date().toISOString())
    setNaoLidas((atual) => Math.max(atual - 1, 0))

    marcarNotificacaoLida(notificacao.id_notificacao).catch(() => {
      carimbar(notificacao.id_notificacao, null)
      setNaoLidas((atual) => atual + 1)
    })
  }

  const lerTodas = () => {
    const anteriores = avisos
    const seloAnterior = naoLidas
    const agora = new Date().toISOString()

    setAvisos((atuais) =>
      atuais.map((item) => (item.lida_em ? item : { ...item, lida_em: agora }))
    )
    setNaoLidas(0)

    marcarTodasNotificacoesLidas().catch(() => {
      setAvisos(anteriores)
      setNaoLidas(seloAnterior)
    })
  }

  const rotuloDoSino =
    naoLidas > 0
      ? `Notificações, ${naoLidas} não lida${naoLidas > 1 ? 's' : ''}`
      : 'Notificações'

  const conteudoDoPainel = () => {
    if (carregando) {
      return <p className="notificacoes__estado">Carregando avisos…</p>
    }

    if (erro) {
      return (
        <p className="notificacoes__estado" role="alert">
          {erro}
        </p>
      )
    }

    if (avisos.length === 0) {
      return <p className="notificacoes__estado">Nenhum aviso por aqui.</p>
    }

    return (
      <ul className="notificacoes__lista">
        {avisos.map((aviso) => (
          <Aviso
            key={aviso.id_notificacao}
            notificacao={aviso}
            destino={rotaDaEntidade(user?.role, aviso.entidade, aviso.entidade_id)}
            onAbrir={() => abrirAviso(aviso)}
          />
        ))}
      </ul>
    )
  }

  return (
    <div className="notificacoes">
      <button
        ref={gatilhoRef}
        type="button"
        className="notificacoes__sino"
        aria-label={rotuloDoSino}
        title={rotuloDoSino}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={() => setAberto((atual) => !atual)}
      >
        <Icone icon={appIcons.notifications} />

        {naoLidas > 0 ? (
          <span className="notificacoes__selo" aria-hidden="true">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        ) : null}
      </button>

      {aberto ? (
        <div
          ref={painelRef}
          className="notificacoes__painel"
          role="dialog"
          aria-label="Notificações"
        >
          <header className="notificacoes__cabecalho">
            <h2 className="notificacoes__titulo">Notificações</h2>

            {naoLidas > 0 ? (
              <button
                type="button"
                className="notificacoes__acao"
                onClick={lerTodas}
              >
                <Icone icon={appIcons.done} />
                Marcar todas como lidas
              </button>
            ) : null}
          </header>

          {conteudoDoPainel()}
        </div>
      ) : null}
    </div>
  )
}
