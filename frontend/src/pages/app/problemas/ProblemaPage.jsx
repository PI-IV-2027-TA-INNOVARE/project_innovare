import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BackLink from '../../../components/console/BackLink'
import { AdminToast, useToast } from '../../../components/console/toast'
import { Icone, appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import {
  complementarOportunidade,
  listarHistorico,
  obterOportunidade,
} from '../../../services/pdConnectApi'
import {
  daApi,
  decisaoLabel,
  eventoDaApi,
  situacaoLabel,
} from '../oportunidades/oportunidadesData'
import { estagioDoDemandante, precisaComplementacao } from './problemasData'
import './ProblemasPage.scss'

function Bloco({ titulo, children }) {
  return (
    <section className="perfil-card">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">{titulo}</h2>
        </div>
      </header>

      <div className="perfil-card__body">{children}</div>
    </section>
  )
}

export default function ProblemaPage() {
  const { id } = useParams()
  const { toast, showToast } = useToast()

  const [problema, setProblema] = useState(null)
  const [eventos, setEventos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')

  const [complemento, setComplemento] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erroEnvio, setErroEnvio] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErroCarga('')

    try {
      const registro = await obterOportunidade(id)
      const trilha = await listarHistorico(id).catch(() => [])

      setProblema(daApi(registro))
      setEventos((trilha.results || trilha).map(eventoDaApi))
    } catch (falha) {
      setProblema(null)
      setErroCarga(falha?.message || 'Não foi possível carregar este problema.')
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  const enviarComplemento = async (event) => {
    event.preventDefault()

    if (!complemento.trim()) return

    setEnviando(true)
    setErroEnvio('')

    try {
      await complementarOportunidade(id, { texto: complemento.trim() })

      setComplemento('')
      setEnviado(true)
      showToast('Complementação enviada ao Núcleo de P&D.')
      await carregar()
    } catch (falha) {
      setErroEnvio(falha?.message || 'Não foi possível enviar a complementação.')
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) {
    return (
      <div className="console problemas-page">
        <BackLink to="/problemas">Voltar para meus problemas</BackLink>
        <p className="oportunidade-page__vazio" role="status">Carregando o problema...</p>
      </div>
    )
  }

  if (!problema) {
    return (
      <div className="console problemas-page">
        <header className="problemas-page__header">
          <div>
            <BackLink to="/problemas">Voltar para meus problemas</BackLink>
            <h1 className="problemas-page__title">Problema não encontrado</h1>
          </div>
        </header>

        <p className="oportunidade-page__vazio">
          {erroCarga || 'Este código não corresponde a nenhum problema da sua organização.'}
        </p>

        <button type="button" className="admin-btn admin-btn--outline" onClick={carregar}>
          Tentar de novo
        </button>
      </div>
    )
  }

  const pedeComplementacao = precisaComplementacao(problema)

  return (
    <div className="console problemas-page">
      <header className="problemas-page__header problemas-page__header--detalhe">
        <div>
          <BackLink to="/problemas">Voltar para meus problemas</BackLink>

          <p className="console-kicker">Problema externo</p>
          <h1 className="problemas-page__title">{problema.titulo}</h1>

          <p className="oportunidade-page__meta">
            <span className="oportunidade-page__codigo">{problema.id}</span>
            <span className={`fluxo-badge fluxo-badge--${problema.situacao}`}>
              {situacaoLabel(problema.situacao)}
            </span>
            <span className="oportunidade-page__demandante">
              cadastrado {formatarUltimoAcesso(problema.criadaEm).toLowerCase()}
            </span>
          </p>
        </div>
      </header>

      <Bloco titulo="Em que ponto está">
        <p className="problema-estagio">{estagioDoDemandante(problema.situacao)}</p>

        <p className="oportunidade-bloco__nota">
          Atualizado {formatarUltimoAcesso(problema.atualizadaEm).toLowerCase()}.
        </p>
      </Bloco>

      {pedeComplementacao ? (
        <section className="perfil-card perfil-card--destaque">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">A AC2 pediu uma complementação</h2>
              <p className="perfil-card__description">
                O Núcleo de P&amp;D precisa de mais informação para seguir com a
                análise deste problema.
              </p>
            </div>
          </header>

          <div className="perfil-card__body">
            {problema.decisao?.justificativa ? (
              <blockquote className="oportunidade-justificativa">
                {problema.decisao.justificativa}
              </blockquote>
            ) : null}

            {enviado ? (
              <p className="problema-estagio" role="status">
                Complementação enviada. O Núcleo de P&amp;D retoma a análise a
                partir do que você acrescentou.
              </p>
            ) : (
              <form onSubmit={enviarComplemento} noValidate>
                <label className="admin-field">
                  <span className="admin-field__label">Sua complementação</span>
                  <textarea
                    className="admin-input admin-input--area"
                    rows={4}
                    value={complemento}
                    onChange={(event) => setComplemento(event.target.value)}
                    placeholder="Acrescente o que foi pedido."
                  />
                </label>

                {erroEnvio ? (
                  <p className="admin-field__error" role="alert">{erroEnvio}</p>
                ) : null}

                <button
                  type="submit"
                  className="admin-btn"
                  disabled={!complemento.trim() || enviando}
                >
                  <Icone icon={appIcons.done} />
                  {enviando ? 'Enviando...' : 'Enviar complementação'}
                </button>
              </form>
            )}
          </div>
        </section>
      ) : null}

      <Bloco titulo="O que você enviou">
        <p className="oportunidade-resumo">{problema.resumo}</p>

        {problema.contexto ? (
          <p className="oportunidade-resumo">{problema.contexto}</p>
        ) : null}
      </Bloco>

      {problema.decisao && !pedeComplementacao ? (
        <Bloco titulo="Encaminhamento do Núcleo de P&D">
          <p className="problema-estagio">
            <span className={`decisao-selo decisao-selo--${problema.decisao.tipo}`}>
              {decisaoLabel(problema.decisao.tipo)}
            </span>
          </p>

          <p className="oportunidade-bloco__nota">
            Registrado {formatarUltimoAcesso(problema.decisao.em).toLowerCase()}. A
            decisão de continuidade é do Núcleo de P&amp;D da AC2.
          </p>
        </Bloco>
      ) : null}

      <Bloco titulo="Histórico">
        {eventos.length > 0 ? (
          <ol className="trilha">
            {eventos.map((evento) => (
              <li className="trilha__item" key={evento.id}>
                <span
                  className={`trilha__marca trilha__marca--${evento.categoria}`}
                  aria-hidden="true"
                >
                  <Icone
                    icon={evento.categoria === 'decisao' ? appIcons.decision : appIcons.folder}
                  />
                </span>

                <div className="trilha__corpo">
                  <p className="trilha__texto">{evento.texto}</p>
                  <p className="trilha__meta">
                    <span className="trilha__ator">{evento.ator}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={new Date(evento.em).toISOString()}>
                      {formatarUltimoAcesso(evento.em)}
                    </time>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="oportunidade-bloco__vazio">
            Ainda não há registros para mostrar neste problema.
          </p>
        )}

        <p className="oportunidade-bloco__nota">
          A análise interna do Núcleo de P&amp;D — competências, matching e
          pré-análise — não aparece nesta trilha.
        </p>
      </Bloco>

      <p className="problemas-page__rodape">
        Precisa falar sobre este problema?{' '}
        <Link className="link-button" to="/painel">Volte ao painel</Link> — os
        contatos do Núcleo de P&amp;D ficam lá.
      </p>

      <AdminToast toast={toast} />
    </div>
  )
}
