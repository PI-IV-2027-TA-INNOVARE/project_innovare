import { Icone, appIcons } from '../../../../lib/icons'
import { etapaPorId } from '../etapas'

export default function ProximoPasso({ etapa, texto, irPara, rotulo }) {
  const destino = etapaPorId(etapa)

  if (!destino) return null

  return (
    <div className="proximo-passo">
      <div>
        <p className="proximo-passo__eyebrow">
          Próximo passo · etapa {destino.numero}
        </p>
        <p className="proximo-passo__texto">{texto || destino.resumo}</p>
      </div>

      {irPara ? (
        <button
          type="button"
          className="admin-btn admin-btn--outline"
          onClick={() => irPara(destino.id)}
        >
          {rotulo || `Ir para ${destino.label}`}
          <Icone icon={appIcons.next} />
        </button>
      ) : null}
    </div>
  )
}
