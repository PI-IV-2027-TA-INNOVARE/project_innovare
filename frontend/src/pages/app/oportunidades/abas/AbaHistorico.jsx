import { useMemo, useState } from 'react'
import { Icone, appIcons } from '../../../../lib/icons'
import { formatarUltimoAcesso } from '../../../../lib/people'
import {
  registrarObservacao,
  solicitarComplemento,
} from '../../../../services/pdConnectApi'
import { decisaoLabel } from '../oportunidadesData'

const CATEGORIAS = [
  { id: 'oportunidade', label: 'Oportunidade', icon: appIcons.folder },
  { id: 'observacao', label: 'Observações', icon: appIcons.edit },
  { id: 'copiloto', label: 'Copiloto IA', icon: appIcons.edit },
  { id: 'competencia', label: 'Competências', icon: appIcons.role },
  { id: 'matching', label: 'Matching', icon: appIcons.users },
  { id: 'preanalise', label: 'Pré-análise', icon: appIcons.researcher },
  { id: 'decisao', label: 'Decisão', icon: appIcons.decision },
]

const categoria = (id) => CATEGORIAS.find((item) => item.id === id)

/**
 * A trilha da oportunidade, e o unico lugar onde o Supervisor escreve nela.
 *
 * A observacao (PB65) nasce aqui porque e aqui que ela e lida: duas telas para
 * a mesma verdade divergem. Escrever nao contradiz o "nada e editado ou
 * apagado" - a trilha e append-only, e acrescentar nao e editar.
 */
export default function AbaHistorico({
  codigo,
  historico,
  decisao,
  podeRegistrar = false,
  podeSolicitarComplemento = false,
}) {
  const [filtro, setFiltro] = useState('todas')
  const [texto, setTexto] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [erro, setErro] = useState('')
  const [novas, setNovas] = useState([])

  const [pedido, setPedido] = useState('')
  const [solicitando, setSolicitando] = useState(false)
  const [erroDoPedido, setErroDoPedido] = useState('')

  const solicitar = async (event) => {
    event.preventDefault()

    if (!pedido.trim() || solicitando) return

    setSolicitando(true)
    setErroDoPedido('')

    try {
      const criada = await solicitarComplemento(codigo, pedido.trim())

      setNovas((atual) => [
        {
          id: `solicitacao-${criada.ocorrido_em}`,
          em: Date.parse(criada.ocorrido_em),
          categoria: 'oportunidade',
          ator: criada.autor_nome,
          texto: `Complementação solicitada ao Demandante: ${criada.mensagem}`,
        },
        ...atual,
      ])
      setPedido('')
    } catch (problema) {
      setErroDoPedido(
        problema?.message || 'Não foi possível solicitar a complementação.'
      )
    } finally {
      setSolicitando(false)
    }
  }

  const registrar = async (event) => {
    event.preventDefault()

    if (!texto.trim() || registrando) return

    setRegistrando(true)
    setErro('')

    try {
      const criada = await registrarObservacao(codigo, texto.trim())

      setNovas((atual) => [
        {
          id: `observacao-${criada.ocorrido_em}`,
          em: Date.parse(criada.ocorrido_em),
          categoria: 'observacao',
          ator: criada.autor_nome,
          texto: criada.texto,
        },
        ...atual,
      ])
      setTexto('')
    } catch (problema) {
      setErro(problema?.message || 'Não foi possível registrar a observação.')
    } finally {
      setRegistrando(false)
    }
  }

  const eventos = useMemo(() => {
    const base = [...historico, ...novas]

    if (decisao && !base.some((evento) => evento.categoria === 'decisao' && evento.em === decisao.em)) {
      base.push({
        id: `decisao-${decisao.em}`,
        em: decisao.em,
        categoria: 'decisao',
        ator: decisao.autor,
        texto: `Decisão registrada: ${decisaoLabel(decisao.tipo)}.`,
      })
    }

    return base
      .filter((evento) => filtro === 'todas' || evento.categoria === filtro)
      .sort((a, b) => b.em - a.em)
  }, [decisao, filtro, historico, novas])

  return (
    <section className="perfil-card">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">Histórico</h2>
          <p className="perfil-card__description">
            Trilha da oportunidade, da entrada ao encerramento. Registro
            permanente: nada aqui é editado ou apagado.
          </p>
        </div>
      </header>

      <div className="perfil-card__body">
        {podeSolicitarComplemento ? (
          <form className="trilha-nota" onSubmit={solicitar} noValidate>
            <label className="admin-field">
              <span className="admin-field__label" htmlFor="trilha-complemento">
                Solicitar complementação
              </span>
              <textarea
                id="trilha-complemento"
                className="admin-input"
                rows={3}
                maxLength={2000}
                placeholder="Que informação falta para o Demandante Externo completar."
                value={pedido}
                onChange={(event) => setPedido(event.target.value)}
              />
            </label>

            <p className="console-form__hint">
              O Demandante Externo recebe um aviso com este texto e responde
              pela própria tela da oportunidade. Não é decisão e não muda a
              etapa — encerrar a avaliação continua sendo a aba Decisão.
            </p>

            {erroDoPedido ? (
              <p className="login-message" role="alert">
                {erroDoPedido}
              </p>
            ) : null}

            <button
              type="submit"
              className="admin-btn"
              disabled={!pedido.trim() || solicitando}
            >
              <Icone icon={appIcons.notifications} />
              {solicitando ? 'Solicitando...' : 'Solicitar'}
            </button>
          </form>
        ) : null}

        {podeRegistrar ? (
          <form className="trilha-nota" onSubmit={registrar} noValidate>
            <label className="admin-field">
              <span className="admin-field__label" htmlFor="trilha-observacao">
                Registrar observação
              </span>
              <textarea
                id="trilha-observacao"
                className="admin-input"
                rows={3}
                maxLength={2000}
                placeholder="O que você quer deixar documentado nesta avaliação."
                value={texto}
                onChange={(event) => setTexto(event.target.value)}
              />
            </label>

            <p className="console-form__hint">
              Fica na trilha com seu nome e a data. Não é decisão: o
              encaminhamento continua sendo registrado na aba Decisão.
            </p>

            {erro ? (
              <p className="login-message" role="alert">
                {erro}
              </p>
            ) : null}

            <button
              type="submit"
              className="admin-btn"
              disabled={!texto.trim() || registrando}
            >
              <Icone icon={appIcons.done} />
              {registrando ? 'Registrando...' : 'Registrar'}
            </button>
          </form>
        ) : null}

        <div className="chip-row" role="group" aria-label="Filtrar o histórico por categoria">
          <button
            type="button"
            className={`chip${filtro === 'todas' ? ' is-selected' : ''}`}
            aria-pressed={filtro === 'todas'}
            onClick={() => setFiltro('todas')}
          >
            Tudo
          </button>

          {CATEGORIAS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip${filtro === item.id ? ' is-selected' : ''}`}
              aria-pressed={filtro === item.id}
              onClick={() => setFiltro(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {eventos.length > 0 ? (
          <ol className="trilha">
            {eventos.map((evento) => (
              <li className="trilha__item" key={evento.id}>
                <span className={`trilha__marca trilha__marca--${evento.categoria}`} aria-hidden="true">
                  <Icone icon={categoria(evento.categoria)?.icon || appIcons.info} />
                </span>

                <div className="trilha__corpo">
                  <p className="trilha__texto">{evento.texto}</p>
                  <p className="trilha__meta">
                    <span className="trilha__ator">{evento.ator}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={new Date(evento.em).toISOString()}>
                      {formatarUltimoAcesso(evento.em)}
                    </time>
                    <span className="admin-tag">{categoria(evento.categoria)?.label}</span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="oportunidade-bloco__vazio">
            Nenhum evento desta categoria nesta oportunidade.
          </p>
        )}
      </div>
    </section>
  )
}
