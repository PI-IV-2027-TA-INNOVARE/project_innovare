import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icone, appIcons } from '../../lib/icons'
import { iniciais, tomDoAvatar } from '../../lib/people'

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

const DISTANCIA_DO_GATILHO = 4

function posicionarMenu(gatilho, lista) {
  const ancora = gatilho.getBoundingClientRect()
  const alturaDaTela = window.innerHeight
  const larguraDaTela = document.documentElement.clientWidth || window.innerWidth
  const altura = lista.offsetHeight
  const cabeAbaixo = ancora.bottom + DISTANCIA_DO_GATILHO + altura <= alturaDaTela
  const cabeAcima = ancora.top - DISTANCIA_DO_GATILHO - altura >= 0
  const acima = !cabeAbaixo && cabeAcima

  return {
    acima,
    estilo: {
      right: `${Math.max(larguraDaTela - ancora.right, 0)}px`,
      ...(acima
        ? { bottom: `${alturaDaTela - ancora.top + DISTANCIA_DO_GATILHO}px` }
        : { top: `${ancora.bottom + DISTANCIA_DO_GATILHO}px` }),
    },
  }
}

export function RowActionsMenu({ label, items }) {
  const [aberto, setAberto] = useState(false)
  const [posicao, setPosicao] = useState(null)
  const containerRef = useRef(null)
  const gatilhoRef = useRef(null)
  const listaRef = useRef(null)
  const raizRef = useRef(null)

  const alternar = () => {
    raizRef.current = gatilhoRef.current?.closest('.console, .admin-page') || document.body
    setPosicao(null)
    setAberto((atual) => !atual)
  }

  useLayoutEffect(() => {
    if (!aberto) return undefined

    const reposicionar = () => {
      if (gatilhoRef.current && listaRef.current) {
        setPosicao(posicionarMenu(gatilhoRef.current, listaRef.current))
      }
    }

    reposicionar()
    window.addEventListener('resize', reposicionar)
    window.addEventListener('scroll', reposicionar, true)

    return () => {
      window.removeEventListener('resize', reposicionar)
      window.removeEventListener('scroll', reposicionar, true)
    }
  }, [aberto])

  useEffect(() => {
    if (!aberto) return undefined

    const onPointerDown = (event) => {
      const dentro = [containerRef.current, listaRef.current].some(
        (elemento) => elemento && elemento.contains(event.target)
      )

      if (!dentro) {
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
        onClick={alternar}
      >
        <Icone icon={appIcons.more} />
      </button>

      {aberto && raizRef.current ? createPortal(
        <div
          ref={listaRef}
          className={`row-menu__list${posicao?.acima ? ' row-menu__list--acima' : ''}`}
          role="menu"
          aria-label={`Ações para ${label}`}
          style={posicao ? posicao.estilo : { visibility: 'hidden' }}
        >
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
              <Icone icon={item.icon} />
              {item.label}
            </button>
          ))}
        </div>,
        raizRef.current
      ) : null}
    </div>
  )
}

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
      <Icone icon={icone} className="sort-button__icon" />
    </button>
  )
}

export function TableEmpty({ icon, title, text, action }) {
  return (
    <div className="table-empty">
      <Icone icon={icon || appIcons.users} className="table-empty__icon" />
      <p className="table-empty__title">{title}</p>
      {text ? <p className="table-empty__text">{text}</p> : null}
      {action}
    </div>
  )
}
