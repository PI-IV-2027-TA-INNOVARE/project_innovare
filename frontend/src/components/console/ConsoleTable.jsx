import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../../lib/icons'
import { iniciais, tomDoAvatar } from '../../lib/people'

/**
 * Peças de tabela do console, compartilhadas pelas telas de gestão.
 *
 * Uma pessoa aparece em Usuários (Administrador), na Rede interna (Supervisor) e
 * no próprio perfil. Avatar, esqueleto de carregamento e menu de linha vivem
 * aqui para que as três leiam igual — e para que corrigir um deles corrija os
 * três.
 */

export function Avatar({ nome, size }) {
  return (
    <span
      className="user-avatar"
      data-tone={tomDoAvatar(nome)}
      data-size={size}
      aria-hidden="true"
    >
      {iniciais(nome)}
    </span>
  )
}

export function SkeletonRows({ colunas, linhas = 6 }) {
  return Array.from({ length: linhas }, (_, linha) => (
    <tr key={linha} className="admin-table__skeleton-row">
      {Array.from({ length: colunas }, (_, coluna) => (
        <td key={coluna}>
          <span
            className="skeleton"
            style={{ width: `${coluna === 0 ? 70 : 45 + ((coluna * 13) % 30)}%` }}
          />
        </td>
      ))}
    </tr>
  ))
}

/**
 * Menu de ações da linha.
 *
 * `items` é a lista de ações — cada uma com `label`, `icon`, `onSelect` e um
 * `tone` opcional (`danger`). O gatilho tem 44px de área clicável (WCAG 2.5.8) e
 * nome acessível com o nome do registro: "Ações" repetido doze vezes não diz a
 * um leitor de tela de qual linha ele é.
 */
export function RowActionsMenu({ label, items }) {
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef(null)
  const gatilhoRef = useRef(null)

  useEffect(() => {
    if (!aberto) return undefined

    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setAberto(false)
      }
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setAberto(false)
        gatilhoRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [aberto])

  return (
    <div ref={containerRef} className="row-menu">
      <button
        ref={gatilhoRef}
        type="button"
        className="row-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={aberto}
        title={`Ações para ${label}`}
        aria-label={`Ações para ${label}`}
        onClick={() => setAberto((atual) => !atual)}
      >
        <FontAwesomeIcon icon={appIcons.more} />
      </button>

      {aberto ? (
        <div className="row-menu__list" role="menu" aria-label={`Ações para ${label}`}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`row-menu__item${item.tone === 'danger' ? ' row-menu__item--danger' : ''}`}
              onClick={() => {
                setAberto(false)
                item.onSelect()
              }}
            >
              <FontAwesomeIcon icon={item.icon} />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Cabeçalho de coluna ordenável, com a seta aparecendo no hover. */
export function SortableHeader({ coluna, ordem, onSort }) {
  const icone =
    ordem.campo !== coluna.id
      ? appIcons.sort
      : ordem.direcao === 'asc'
        ? appIcons.sortAsc
        : appIcons.sortDesc

  return (
    <button
      type="button"
      className={`sort-button${ordem.campo === coluna.id ? ' is-active' : ''}`}
      onClick={() => onSort(coluna.id)}
      title={`Ordenar por ${coluna.label}`}
      aria-label={`Ordenar por ${coluna.label}`}
    >
      {coluna.label}
      <FontAwesomeIcon icon={icone} className="sort-button__icon" />
    </button>
  )
}

/** Estado vazio de tabela, com a ação que faz sentido no contexto. */
export function TableEmpty({ icon, title, text, action }) {
  return (
    <div className="table-empty">
      <FontAwesomeIcon icon={icon || appIcons.users} className="table-empty__icon" />
      <p className="table-empty__title">{title}</p>
      {text ? <p className="table-empty__text">{text}</p> : null}
      {action}
    </div>
  )
}
