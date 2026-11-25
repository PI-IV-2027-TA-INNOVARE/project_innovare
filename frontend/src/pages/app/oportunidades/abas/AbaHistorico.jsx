import { useId, useMemo, useState } from 'react'
import VerDetalhes from '../../../../components/console/VerDetalhes'
import { Icone, appIcons } from '../../../../lib/icons'
import { decisaoLabel } from '../oportunidadesData'

const CATEGORIAS = [
  { id: 'oportunidade', label: 'Oportunidade', icon: appIcons.folder },
  { id: 'observacao', label: 'Observações', icon: appIcons.edit },
  { id: 'copiloto', label: 'Copiloto', icon: appIcons.compass },
  { id: 'competencia', label: 'Competências', icon: appIcons.role },
  { id: 'matching', label: 'Equipe potencial', icon: appIcons.users },
  { id: 'preanalise', label: 'Pré-análise', icon: appIcons.researcher },
  { id: 'decisao', label: 'Decisão', icon: appIcons.decision },
]

const DIA = 24 * 60 * 60 * 1000
const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const DATA_E_HORA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' })

const categoria = (id) => CATEGORIAS.find((item) => item.id === id)

const contagem = (total) => `${total} ${total === 1 ? 'evento' : 'eventos'}`

function rotuloDoDia(data, referencia = Date.now()) {
  if (data === DATA.format(referencia)) return `Hoje, ${data}`
  if (data === DATA.format(referencia - DIA)) return `Ontem, ${data}`
  return data
}

function porDia(eventos) {
  const dias = []

  for (const evento of eventos) {
    const data = DATA.format(evento.em)
    const ultimo = dias[dias.length - 1]

    if (ultimo?.data === data) ultimo.eventos.push(evento)
    else dias.push({ data, rotulo: rotuloDoDia(data), eventos: [evento] })
  }

  return dias
}

function Evento({ evento }) {
  return (
    <li className="trilha__item">
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
          <time dateTime={new Date(evento.em).toISOString()} title={DATA_E_HORA.format(evento.em)}>
            {HORA.format(evento.em)}
          </time>
          <span aria-hidden="true">·</span>
          <span className="trilha__ator">{evento.ator}</span>
          {categoria(evento.categoria) ? (
            <span className="admin-tag">{categoria(evento.categoria).label}</span>
          ) : null}
        </p>
      </div>
    </li>
  )
}

export default function AbaHistorico({ historico, decisao }) {
  const prefixo = useId()
  const [filtro, setFiltro] = useState('todas')

  const todos = useMemo(() => {
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

    return base.sort((a, b) => b.em - a.em)
  }, [decisao, historico])

  const presentes = CATEGORIAS.map((item) => ({
    ...item,
    total: todos.filter((evento) => evento.categoria === item.id).length,
  })).filter((item) => item.total > 0)

  const eventos = todos.filter((evento) => filtro === 'todas' || evento.categoria === filtro)
  const dias = porDia(eventos)

  const filtros = [{ id: 'todas', label: 'Tudo', total: todos.length }, ...presentes]

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
        {presentes.length > 1 ? (
          <div className="chip-row" role="group" aria-label="Filtrar o histórico por categoria">
            {filtros.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chip${filtro === item.id ? ' is-selected' : ''}`}
                aria-pressed={filtro === item.id}
                aria-label={`${item.label}, ${contagem(item.total)}`}
                onClick={() => setFiltro(item.id)}
              >
                {item.label}
                <span className="chip__total" aria-hidden="true">{item.total}</span>
              </button>
            ))}
          </div>
        ) : null}

        {dias.length > 0 ? (
          <div className="trilha-dias">
            {dias.map((dia, indice) => (
              <section key={dia.data} className="trilha-dia">
                <h3 id={`${prefixo}-${indice}`} className="trilha-dia__titulo">
                  {dia.rotulo}
                </h3>
                <ol className="trilha" aria-labelledby={`${prefixo}-${indice}`}>
                  {dia.eventos.map((evento) => (
                    <Evento key={evento.id} evento={evento} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <p className="oportunidade-bloco__vazio">
            Nenhum evento desta categoria nesta oportunidade.
          </p>
        )}
      </div>
    </section>
  )
}
