import { Icone, appIcons } from '../../../../lib/icons'
import { etapaPorId } from '../etapas'

export default function EtapaBloqueada({ motivo, etapa, irPara }) {
  const destino = etapaPorId(etapa)

  return (
    <div className="admin-callout admin-callout--alerta" role="note">
      <Icone icon={appIcons.warning} className="admin-callout__icon" />
      <p className="admin-callout__text">{motivo}</p>
      {irPara && destino ? (
        <button type="button" className="link-button" onClick={() => irPara(destino.id)}>
          Ir para {destino.label}
        </button>
      ) : null}
    </div>
  )
}
