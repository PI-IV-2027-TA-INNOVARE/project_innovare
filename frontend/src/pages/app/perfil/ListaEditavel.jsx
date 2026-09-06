import { useId, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../../../lib/icons'

/**
 * Lista de termos em chips — competências, técnicas, linhas de pesquisa.
 *
 * Entrada livre por enquanto. O vocabulário definitivo (controlado, livre ou
 * híbrido) é P11 no plano: é a decisão que mais afeta a meta de ≥ 80% de
 * pertinência do matching, e não é minha para tomar. Quando houver catálogo,
 * muda a fonte das sugestões — não este componente.
 */
export default function ListaEditavel({ label, placeholder, values = [], onChange }) {
  const [rascunho, setRascunho] = useState('')
  const inputId = useId()

  const adicionar = () => {
    const termo = rascunho.trim()

    if (!termo) return
    // Comparação sem acento e sem caixa: "Fermentação" e "fermentacao" são o
    // mesmo termo para quem lê, e duas features distintas para o matching.
    const jaExiste = values.some(
      (valor) => valor.localeCompare(termo, 'pt-BR', { sensitivity: 'base' }) === 0
    )

    if (jaExiste) {
      setRascunho('')
      return
    }

    onChange([...values, termo])
    setRascunho('')
  }

  const remover = (termo) => onChange(values.filter((valor) => valor !== termo))

  return (
    <div className="lista-editavel">
      <div className="lista-editavel__entrada">
        <label className="sr-only" htmlFor={inputId}>{`Adicionar em ${label}`}</label>
        <input
          id={inputId}
          type="text"
          className="admin-input"
          value={rascunho}
          placeholder={placeholder}
          onChange={(event) => setRascunho(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            // Enter num campo dentro de <form> submeteria a página.
            event.preventDefault()
            adicionar()
          }}
        />
        <button
          type="button"
          className="admin-btn admin-btn--outline"
          onClick={adicionar}
          disabled={!rascunho.trim()}
        >
          Adicionar
        </button>
      </div>

      {values.length > 0 ? (
        <ul className="lista-editavel__chips">
          {values.map((valor) => (
            <li key={valor}>
              <button
                type="button"
                className="chip chip--removable"
                onClick={() => remover(valor)}
                aria-label={`Remover ${valor}`}
              >
                {valor}
                <FontAwesomeIcon icon={appIcons.clear} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lista-editavel__vazio">
          Nada declarado ainda — esta dimensão fica de fora do matching.
        </p>
      )}
    </div>
  )
}
