import { useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../../../../lib/icons'
import { formatarUltimoAcesso } from '../../../../lib/people'
import { decisaoLabel } from '../oportunidadesData'

/**
 * Histórico da oportunidade (RF12).
 *
 * A trilha é **append-only**: nada aqui se edita nem se apaga — é o que torna a
 * rastreabilidade utilizável (PLANO_IMPLEMENTACAO.md §5.1). O filtro por
 * categoria existe porque a pergunta de quem audita é sempre específica: "o que
 * a IA fez?" é uma pergunta, "quem decidiu?" é outra.
 */

const CATEGORIAS = [
  { id: 'oportunidade', label: 'Oportunidade', icon: appIcons.folder },
  { id: 'copiloto', label: 'Copiloto IA', icon: appIcons.edit },
  { id: 'competencia', label: 'Competências', icon: appIcons.role },
  { id: 'matching', label: 'Matching', icon: appIcons.users },
  { id: 'preanalise', label: 'Pré-análise', icon: appIcons.researcher },
  { id: 'decisao', label: 'Decisão', icon: appIcons.decision },
]

const categoria = (id) => CATEGORIAS.find((item) => item.id === id)

export default function AbaHistorico({ historico, decisao }) {
  const [filtro, setFiltro] = useState('todas')

  const eventos = useMemo(() => {
    const base = [...historico]

    // A decisão registrada nesta sessão entra na trilha como qualquer outro
    // evento — não existe estado "decidido" fora do histórico.
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
                  <FontAwesomeIcon icon={categoria(evento.categoria)?.icon || appIcons.info} />
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
