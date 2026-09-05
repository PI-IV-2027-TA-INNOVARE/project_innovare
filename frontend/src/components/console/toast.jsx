import { useCallback, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../../lib/icons'

const DURACAO_MS = 2600

/**
 * Aviso curto de resultado, no canto inferior direito.
 *
 * Vive fora das telas porque as duas seções do console precisam dele com o
 * mesmo comportamento: uma mensagem por vez, o timer reiniciando a cada nova
 * mensagem, e nada de fila — quem acabou de mexer numa cor não quer ler o aviso
 * da cor anterior.
 */
export function useToast(duracao = DURACAO_MS) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const showToast = useCallback((message, tone = 'ok') => {
    setToast({ message, tone, id: Date.now() })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), duracao)
  }, [duracao])

  return { toast, showToast }
}

const ICONE = {
  ok: appIcons.done,
  info: appIcons.info,
  error: appIcons.warning,
}

export function AdminToast({ toast }) {
  if (!toast) return null

  return (
    <div className={`admin-toast admin-toast--${toast.tone}`} role="status" aria-live="polite">
      <FontAwesomeIcon icon={ICONE[toast.tone] || ICONE.ok} className="admin-toast__icon" />
      {toast.message}
    </div>
  )
}
