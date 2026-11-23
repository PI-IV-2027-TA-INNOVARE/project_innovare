import { useMemo, useState } from 'react'
import VerDetalhes from '../../../../components/console/VerDetalhes'
import { Icone, appIcons } from '../../../../lib/icons'
import { formatarUltimoAcesso } from '../../../../lib/people'
import { solicitarComplemento } from '../../../../services/pdConnectApi'
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

export default function AbaHistorico({
  codigo,
  historico,
  decisao,
  podeSolicitarComplemento = false,
  aoRegistrar,
}) {
  const [filtro, setFiltro] = useState('todas')

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

      aoRegistrar?.({
        id: `solicitacao-${criada.ocorrido_em}`,
        em: Date.parse(criada.ocorrido_em),
        categoria: 'oportunidade',
        ator: criada.autor_nome,
        texto: `Complementação solicitada ao Demandante: ${criada.mensagem}`,
      })
      setPedido('')
    } catch (problema) {
      setErroDoPedido(
        problema?.message || 'Não foi possível solicitar a complementação.'
      )
    } finally {
      setSolicitando(false)
    }
  }

  const eventos = useMemo(() => {
    const base = [...historico]

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
  }, [decisao, filtro, historico])

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
                  {evento.anterior?.length > 0 ? (
                    <VerDetalhes
                      rotulo="Ver a versão anterior"
                      rotuloAberto="Ocultar a versão anterior"
                      className="trilha__anterior"
                    >
                      <dl className="trilha__anterior-lista">
                        {evento.anterior.map((item) => (
                          <div key={item.elemento}>
                            <dt>{item.rotulo}</dt>
                            <dd>{item.texto}</dd>
                          </div>
                        ))}
                      </dl>
                    </VerDetalhes>
                  ) : null}
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
