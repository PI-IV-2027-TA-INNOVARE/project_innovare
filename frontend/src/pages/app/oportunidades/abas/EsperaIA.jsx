import { useEffect, useState } from 'react'

const AVISO_DE_DEMORA_S = 30

export default function EsperaIA({ titulo, detalhe, desde }) {
  const [inicio] = useState(() => (desde ? Date.parse(desde) : Date.now()))
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(relogio)
  }, [])

  const segundos = Math.max(0, Math.floor((agora - inicio) / 1000))
  const demorando = segundos >= AVISO_DE_DEMORA_S

  return (
    <div className="espera-ia" role="status" aria-live="polite">
      <span className="espera-ia__indicador" aria-hidden="true" />
      <div>
        <p className="espera-ia__titulo">{titulo}</p>
        <p className="espera-ia__detalhe">
          {demorando
            ? 'Está demorando mais que o normal; a IA ainda está respondendo.'
            : detalhe || 'Isso costuma levar de 10 a 30 segundos. Não feche esta aba.'}
        </p>
      </div>
      <span className="espera-ia__tempo">{segundos}s</span>
    </div>
  )
}
