import { Icone, appIcons } from '../../lib/icons'
import { OPCOES_DE_LINHAS, TODAS_AS_LINHAS } from '../../lib/linhasPorPagina'

/**
 * O rodapé de paginação das listas: quantas linhas, em que página, e os
 * botões para andar. É o mesmo em Usuários, Oportunidades e Rede interna.
 */
export default function RodapeDePaginacao({
  rotulo,
  total,
  inicio,
  fim,
  pagina,
  totalPaginas,
  porPagina,
  onPagina,
  onPorPagina,
  complemento = '',
}) {
  return (
    <nav className="pagination" aria-label={rotulo}>
      <p className="pagination__summary">
        {total === 0 ? 'Nenhum registro' : `Mostrando ${inicio + 1}–${fim} de ${total}`}
        {complemento}
      </p>

      <div className="pagination__controls">
        <label className="pagination__size">
          Linhas por página
          <select
            className="admin-input admin-input--compact"
            value={porPagina}
            onChange={(event) => onPorPagina(Number(event.target.value))}
            aria-label="Linhas por página"
          >
            {OPCOES_DE_LINHAS.map((quantidade) => (
              <option key={quantidade} value={quantidade}>{quantidade}</option>
            ))}
            <option value={TODAS_AS_LINHAS}>Todos</option>
          </select>
        </label>

        <span className="pagination__page">Página {pagina} de {totalPaginas}</span>

        <div className="pagination__buttons">
          <button
            type="button"
            className="icon-button"
            onClick={() => onPagina(1)}
            disabled={pagina <= 1}
            title="Primeira página"
            aria-label="Primeira página"
          >
            <Icone icon={appIcons.first} />
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={() => onPagina(Math.max(1, pagina - 1))}
            disabled={pagina <= 1}
            title="Página anterior"
            aria-label="Página anterior"
          >
            <Icone icon={appIcons.previous} />
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={() => onPagina(Math.min(totalPaginas, pagina + 1))}
            disabled={pagina >= totalPaginas}
            title="Próxima página"
            aria-label="Próxima página"
          >
            <Icone icon={appIcons.next} />
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={() => onPagina(totalPaginas)}
            disabled={pagina >= totalPaginas}
            title="Última página"
            aria-label="Última página"
          >
            <Icone icon={appIcons.last} />
          </button>
        </div>
      </div>
    </nav>
  )
}
