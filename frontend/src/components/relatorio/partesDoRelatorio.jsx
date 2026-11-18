import { Icone, appIcons } from '../../lib/icons'

export function formatarData(valor) {
  if (!valor) return '—'

  const data = new Date(valor)

  return Number.isNaN(data.getTime())
    ? '—'
    : data.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

export function porcentagem(valor) {
  if (valor === null || valor === undefined) return '—'

  return `${Math.round(Number(valor) * 100)}%`
}

export function Campo({ rotulo, children }) {
  return (
    <div className="relatorio-campo">
      <dt className="relatorio-campo__rotulo">{rotulo}</dt>
      <dd className="relatorio-campo__valor">{children || '—'}</dd>
    </div>
  )
}

const MARCADOR_DE_ITEM = /^[-•*]\s+/

export function TextoFormatado({ texto, className = 'relatorio-texto' }) {
  const blocos = []

  String(texto || '')
    .replace(/\.;\s*/g, '. ')
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean)
    .forEach((linha) => {
      if (!MARCADOR_DE_ITEM.test(linha)) {
        blocos.push({ tipo: 'paragrafo', texto: linha })
        return
      }

      const item = linha.replace(MARCADOR_DE_ITEM, '')
      const ultimo = blocos[blocos.length - 1]

      if (ultimo?.tipo === 'lista') ultimo.itens.push(item)
      else blocos.push({ tipo: 'lista', itens: [item] })
    })

  return (
    <>
      {blocos.map((bloco, posicao) =>
        bloco.tipo === 'lista' ? (
          <ul key={posicao} className="relatorio-lista">
            {bloco.itens.map((item, indice) => (
              <li key={`${posicao}-${indice}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={posicao} className={className}>{bloco.texto}</p>
        ),
      )}
    </>
  )
}

const ICONES_DA_MATURIDADE = {
  consolidada: appIcons.done,
  em_desenvolvimento: appIcons.flow,
  fragil: appIcons.warning,
}

const GRAVIDADE = { fragil: 0, em_desenvolvimento: 1, consolidada: 2 }

export function porGravidade(itens) {
  return [...itens].sort(
    (um, outro) => (GRAVIDADE[um.nivel] ?? 3) - (GRAVIDADE[outro.nivel] ?? 3),
  )
}

export function SeloDeMaturidade({ nivel, rotulo }) {
  return (
    <span className={`relatorio-selo relatorio-selo--${nivel || 'neutro'}`}>
      {ICONES_DA_MATURIDADE[nivel] ? <Icone icon={ICONES_DA_MATURIDADE[nivel]} /> : null}
      {rotulo}
    </span>
  )
}
