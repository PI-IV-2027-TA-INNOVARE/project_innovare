import { useLayoutEffect, useRef, useState } from 'react'
import BackLink from '../console/BackLink'
import { Icone, appIcons } from '../../lib/icons'
import './LayoutDoRelatorio.scss'

export function idDaSecao(titulo) {
  return `relatorio-secao-${String(titulo)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}`
}

export function SecaoDoRelatorio({ titulo, children }) {
  const id = idDaSecao(titulo)

  return (
    <section className="relatorio-secao" aria-labelledby={`${id}-titulo`} id={id} tabIndex={-1}>
      <h2 id={`${id}-titulo`} className="relatorio-secao__titulo">{titulo}</h2>
      {children}
    </section>
  )
}

export function SubsecaoDoRelatorio({ titulo, children }) {
  return (
    <div className="relatorio-subsecao">
      <h3 className="relatorio-subsecao__titulo">{titulo}</h3>
      {children}
    </div>
  )
}

function irPara(evento, id) {
  const alvo = document.getElementById(id)

  if (!alvo) return

  evento.preventDefault()
  alvo.scrollIntoView?.({ block: 'start' })
  alvo.focus({ preventScroll: true })
}

/**
 * O leiaute único dos relatórios: o documento e, ao lado, o painel com o
 * sumário das seções, a identificação e a impressão. A volta para a
 * oportunidade fica acima de tudo, como botão: quem só consulta o relatório
 * não precisa procurá-la no painel.
 *
 * Em tela larga o painel acompanha a rolagem à direita; em tela média vira uma
 * faixa acima do documento; no celular, uma coluna só. Na impressão ele some e
 * o documento ocupa a folha.
 */
export default function LayoutDoRelatorio({ voltarPara, identificacao = [], children }) {
  const documento = useRef(null)
  const [secoes, setSecoes] = useState([])

  useLayoutEffect(() => {
    const encontradas = [...(documento.current?.querySelectorAll('section.relatorio-secao[id]') || [])]
      .map((secao) => ({
        id: secao.id,
        titulo: secao.querySelector('.relatorio-secao__titulo')?.textContent || '',
      }))

    const chave = encontradas.map((secao) => secao.id).join('|')

    setSecoes((atuais) => (atuais.map((secao) => secao.id).join('|') === chave ? atuais : encontradas))
  })

  return (
    <div className="console relatorio-page relatorio-layout">
      <div className="relatorio-layout__topo">
        <BackLink to={voltarPara}>Voltar para a oportunidade</BackLink>
      </div>

      <aside className="relatorio-painel" aria-label="Sumário e ações do relatório">
        {secoes.length > 0 ? (
          <nav className="relatorio-painel__bloco" aria-label="Sumário do relatório">
            <p className="relatorio-painel__titulo">Sumário</p>
            <ol className="relatorio-painel__sumario">
              {secoes.map((secao) => (
                <li key={secao.id}>
                  <a href={`#${secao.id}`} onClick={(evento) => irPara(evento, secao.id)}>
                    {secao.titulo}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        {identificacao.length > 0 ? (
          <div className="relatorio-painel__bloco">
            <p className="relatorio-painel__titulo">Identificação</p>
            <dl className="relatorio-painel__identificacao">
              {identificacao.map((item) => (
                <div key={item.rotulo}>
                  <dt>{item.rotulo}</dt>
                  <dd>{item.valor || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <div className="relatorio-painel__acoes">
          <button type="button" className="admin-btn" onClick={() => window.print()}>
            <Icone icon={appIcons.print} />
            Imprimir
          </button>
        </div>
      </aside>

      <div className="relatorio-layout__documento" ref={documento}>
        {children}
      </div>
    </div>
  )
}
