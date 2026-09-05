import { useEffect, useId, useRef } from 'react'

/**
 * Diálogo do console de administração.
 *
 * Três coisas que um `<div>` com overlay não faz sozinho e que aqui são
 * obrigatórias: devolver o foco a quem abriu (o menu da linha some ao abrir o
 * modal, então sem isto o foco cairia no <body>), fechar no Escape, e travar a
 * rolagem do fundo enquanto o diálogo está aberto.
 */
export default function AdminModal({ title, description, onClose, footer, children, size = 'md' }) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef(null)
  const openerRef = useRef(null)

  useEffect(() => {
    openerRef.current = document.activeElement

    const primeiroCampo = dialogRef.current?.querySelector(
      'input, select, textarea, button:not([data-autofocus="false"])'
    )

    primeiroCampo?.focus()

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow

      if (openerRef.current instanceof HTMLElement && document.contains(openerRef.current)) {
        openerRef.current.focus()
      }
    }
  }, [onClose])

  return (
    <div className="admin-modal" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div
        ref={dialogRef}
        className={`admin-modal__dialog admin-modal__dialog--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className="admin-modal__header">
          <h3 id={titleId} className="admin-modal__title">{title}</h3>
          {description ? (
            <p id={descriptionId} className="admin-modal__description">{description}</p>
          ) : null}
        </header>

        <div className="admin-modal__body">{children}</div>

        <footer className="admin-modal__footer">{footer}</footer>
      </div>
    </div>
  )
}
