import ProximoPasso from './ProximoPasso'

export default function EtapaBloqueada({ motivo, etapa, irPara }) {
  return <ProximoPasso etapa={etapa} texto={motivo} irPara={irPara} />
}
