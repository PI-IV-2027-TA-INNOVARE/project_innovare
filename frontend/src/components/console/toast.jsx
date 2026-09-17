import { useCallback, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../../lib/icons'

const DURACAO_MS = 2600

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
