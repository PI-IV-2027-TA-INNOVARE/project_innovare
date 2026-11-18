import { Icone, appIcons } from '../../../../lib/icons'
import { etapaPorId } from '../etapas'

export default function BarraDeAcoes({ estado, children }) {
  return (
    <div className="barra-de-acoes" role="group" aria-label="Ações da etapa">
      <span className="barra-de-acoes__estado" role="status">
        {estado}
      </span>
      <div className="barra-de-acoes__botoes">{children}</div>
    </div>
  )
}

export function ContinuarPara({ etapa, irPara, secundario = false }) {
  const destino = etapaPorId(etapa)

  if (!destino || !irPara) return null

  return (
    <button
      type="button"
      className={secundario ? 'admin-btn admin-btn--outline' : 'admin-btn'}
      onClick={() => irPara(destino.id)}
    >
      Continuar para {destino.label}
      <Icone icon={appIcons.next} />
    </button>
  )
}
