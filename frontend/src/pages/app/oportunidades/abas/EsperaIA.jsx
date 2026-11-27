import { useEffect, useState } from 'react'
import { Icone, appIcons } from '../../../../lib/icons'

const AVISO_DE_DEMORA_S = 30

export default function EsperaIA({ titulo, detalhe, desde }) {
  const [inicio] = useState(() => (desde ? Date.parse(desde) : Date.now()))
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(relogio)
  }, [])

  const demorando = (agora - inicio) / 1000 >= AVISO_DE_DEMORA_S

  return (
    <div className="espera-ia" role="status" aria-live="polite">
      <Icone icon={appIcons.sync} className="espera-ia__icone" />
      <div>
        <p className="espera-ia__titulo">{titulo}</p>
        <p className="espera-ia__detalhe">
          {demorando
            ? 'Está demorando mais que o normal; a IA ainda está respondendo.'
            : detalhe || 'Isso costuma levar de 10 a 30 segundos. Não feche esta aba.'}
        </p>
      </div>
    </div>
  )
}
