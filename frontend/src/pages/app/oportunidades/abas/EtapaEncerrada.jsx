import { Icone, appIcons } from '../../../../lib/icons'

const MOTIVOS = {
  continuar:
    'Esta oportunidade recebeu a decisão Continuar e concluiu o fluxo no P&D Connect. As etapas ficam como estavam na decisão.',
  arquivada:
    'Esta oportunidade foi arquivada e saiu do fluxo ativo. As etapas ficam como estavam na decisão.',
}

export default function EtapaEncerrada({ situacao, irPara }) {
  const motivo = MOTIVOS[situacao]

  if (!motivo) return null

  return (
    <div className="admin-callout" role="note">
      <Icone icon={appIcons.lock} className="admin-callout__icon" />
      <p className="admin-callout__text">{motivo}</p>
      {irPara ? (
        <button type="button" className="link-button" onClick={() => irPara('decisao')}>
          Ver a decisão
        </button>
      ) : null}
    </div>
  )
}
