import { useEffect, useState } from 'react'
import { Icone, appIcons } from '../../../../lib/icons'
import { obterProposta } from '../../../../services/pdConnectApi'

const ELEMENTOS = [
  'problema_pesquisa',
  'hipotese',
  'objetivo_geral',
  'objetivos_especificos',
  'metodologia',
  'resultados_esperados',
  'caracterizacao_inovacao',
  'infraestrutura_recursos',
]

const preenchido = (valor) =>
  Array.isArray(valor) ? valor.length > 0 : Boolean(String(valor ?? '').trim())

export default function AvisoPropostaNaoRevisada({ oportunidadeId, irPara, aoVerificar }) {
  const [pendente, setPendente] = useState(false)

  useEffect(() => {
    let ativo = true

    async function carregar() {
      try {
        const proposta = await obterProposta(oportunidadeId)
        const temConteudo = ELEMENTOS.some((elemento) => preenchido(proposta[elemento]))
        const agora = temConteudo && !proposta.revisada_por_humano

        if (ativo) {
          setPendente(agora)
          aoVerificar?.(agora)
        }
      } catch {
        if (ativo) {
          setPendente(false)
          aoVerificar?.(false)
        }
      }
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [oportunidadeId, aoVerificar])

  if (!pendente) return null

  return (
    <div className="admin-callout admin-callout--alerta" role="note">
      <Icone icon={appIcons.warning} className="admin-callout__icon" />
      <p className="admin-callout__text">
        A proposta estruturada ainda não foi revisada. Esta etapa fica liberada
        depois que você revisa e salva o texto do Copiloto.
      </p>
      {irPara ? (
        <button
          type="button"
          className="link-button"
          onClick={() => irPara('proposta')}
        >
          Revisar a proposta
        </button>
      ) : null}
    </div>
  )
}
