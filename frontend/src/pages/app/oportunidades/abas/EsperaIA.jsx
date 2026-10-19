import { useEffect, useState } from 'react'

export default function EsperaIA({ titulo, detalhe }) {
  const [segundos, setSegundos] = useState(0)

  useEffect(() => {
    const relogio = setInterval(() => setSegundos((atual) => atual + 1), 1000)
    return () => clearInterval(relogio)
  }, [])

  return (
    <div className="espera-ia" role="status" aria-live="polite">
      <span className="espera-ia__indicador" aria-hidden="true" />
      <div>
        <p className="espera-ia__titulo">{titulo}</p>
        <p className="espera-ia__detalhe">
          {detalhe || 'Isso costuma levar de 10 a 30 segundos. Não feche esta aba.'}
        </p>
      </div>
      <span className="espera-ia__tempo">{segundos}s</span>
    </div>
  )
}
