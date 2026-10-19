import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BackLink from '../../../components/console/BackLink'
import { Icone, appIcons } from '../../../lib/icons'
import { obterRelatorioPreAnalise } from '../../../services/pdConnectApi'
import './RelatorioPage.scss'

const CODIGO_SEM_ANALISE = 'preanalise_inexistente'
const CODIGO_SEM_PROPOSTA = 'proposta_inexistente'

const ELEMENTOS_DA_PROPOSTA = [
  ['problema_pesquisa', 'Problema de pesquisa'],
  ['objetivo_geral', 'Objetivo geral'],
  ['metodologia', 'Metodologia'],
  ['caracterizacao_inovacao', 'Caracterização da inovação'],
  ['infraestrutura_recursos', 'Infraestrutura e recursos'],
]

function formatarData(valor) {
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

function Secao({ titulo, children }) {
  const id = `preanalise-secao-${titulo.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <section className="relatorio-secao" aria-labelledby={id}>
      <h2 id={id} className="relatorio-secao__titulo">{titulo}</h2>
      {children}
    </section>
  )
}

function Campo({ rotulo, children }) {
  return (
    <div className="relatorio-campo">
      <dt className="relatorio-campo__rotulo">{rotulo}</dt>
      <dd className="relatorio-campo__valor">{children || '—'}</dd>
    </div>
  )
}

export default function RelatorioPreAnalisePage() {
  const { id } = useParams()

  const [relatorio, setRelatorio] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [semAnalise, setSemAnalise] = useState(false)
  const [semProposta, setSemProposta] = useState(false)

  const carregar = useCallback(() => {
    let ativo = true

    obterRelatorioPreAnalise(id)
      .then((dados) => {
        if (!ativo) return

        setRelatorio(dados)
        setErro('')
        setSemAnalise(false)
        setSemProposta(false)
      })
      .catch((falha) => {
        if (!ativo) return

        setRelatorio(null)

        if (falha?.data?.codigo === CODIGO_SEM_ANALISE) {
          setSemAnalise(true)
        } else if (falha?.data?.codigo === CODIGO_SEM_PROPOSTA) {
          setSemProposta(true)
        } else {
          setErro(falha?.message || 'Não foi possível montar o relatório.')
        }
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [id])

  useEffect(() => carregar(), [carregar])

  if (carregando) {
    return (
      <div className="console relatorio-page">
        <p className="perfil-card__note" role="status">Montando o relatório...</p>
      </div>
    )
  }

  if (semAnalise) {
    return (
      <div className="console relatorio-page">
        <BackLink to={`/oportunidades/${id}`}>Voltar para a oportunidade</BackLink>
        <p className="perfil-card__note">
          Esta oportunidade ainda não tem pré-análise executada. O relatório
          existe a partir da primeira execução — não há folha a imprimir antes
          dela.
        </p>
      </div>
    )
  }

  if (semProposta) {
    return (
      <div className="console relatorio-page">
        <BackLink to={`/oportunidades/${id}`}>Voltar para a oportunidade</BackLink>
        <p className="perfil-card__note">
          Esta oportunidade ainda não tem proposta estruturada. A pré-análise lê
          a proposta — não há folha a imprimir antes dela.
        </p>
      </div>
    )
  }

  if (erro) {
    return (
      <div className="console relatorio-page">
        <BackLink to={`/oportunidades/${id}`}>Voltar para a oportunidade</BackLink>
        <p className="admin-field__error" role="alert">{erro}</p>
      </div>
    )
  }

  const { oportunidade, proposta, pre_analise: analise, criterios, equipe } = relatorio
  const falhou = analise.status !== 'ok'

  return (
    <div className="console relatorio-page">
      <div className="relatorio-page__acoes">
        <BackLink to={`/oportunidades/${id}`}>Voltar para a oportunidade</BackLink>

        <button type="button" className="admin-btn" onClick={() => window.print()}>
          <Icone icon={appIcons.view} />
          Imprimir
        </button>
      </div>

      <article className="relatorio-documento">
        <header className="relatorio-documento__header">
          <p className="relatorio-documento__kicker">
            Relatório de maturidade PIPE/FAPESP
          </p>
          <h1 className="relatorio-documento__titulo">{oportunidade.titulo}</h1>

          <p className="relatorio-documento__meta">
            <span className="relatorio-documento__codigo">{oportunidade.codigo}</span>
            <span>{oportunidade.origem_rotulo}</span>
            <span>Critérios {analise.versao_criterios}</span>
            <span>Proposta versão {analise.versao_proposta}</span>
          </p>

          <p className="relatorio-documento__aviso">{analise.aviso}</p>
        </header>

        <Secao titulo="Execução">
          <dl className="relatorio-campos">
            <Campo rotulo="Executada em">{formatarData(analise.executada_em)}</Campo>
            <Campo rotulo="Executada por">{analise.executada_por}</Campo>
            <Campo rotulo="Situação">{analise.status_rotulo}</Campo>
            <Campo rotulo="Execução de IA">{analise.ai_run_id || '—'}</Campo>
          </dl>

          {falhou ? (
            <p className="relatorio-vazio">
              A execução não produziu resultado
              {analise.erro ? ` (motivo: ${analise.erro})` : ''}. Nenhuma dimensão
              é apresentada: um relatório preenchido sem análise diria o que o
              módulo não concluiu.
            </p>
          ) : null}

          {analise.sintese ? (
            <p className="relatorio-campo__valor">{analise.sintese}</p>
          ) : null}
        </Secao>

        {analise.dimensoes.length > 0 ? (
          <Secao titulo="Resultado por dimensão">
            <dl className="relatorio-campos relatorio-campos--coluna">
              {analise.dimensoes.map((dimensao) => (
                <Campo
                  key={dimensao.id_dimensao}
                  rotulo={`${dimensao.dimensao_rotulo} · ${dimensao.nivel_rotulo}`}
                >
                  {dimensao.avaliacao}
                  {dimensao.evidencias?.length > 0 ? (
                    <ul className="relatorio-lista">
                      {dimensao.evidencias.map((evidencia, indice) => (
                        <li key={`${dimensao.id_dimensao}-${indice}`}>{evidencia}</li>
                      ))}
                    </ul>
                  ) : null}
                </Campo>
              ))}
            </dl>
          </Secao>
        ) : null}

        {analise.lacunas.length > 0 ? (
          <Secao titulo="Lacunas">
            <ul className="relatorio-lista">
              {analise.lacunas.map((lacuna) => (
                <li key={lacuna.id_lacuna}>{lacuna.descricao}</li>
              ))}
            </ul>
          </Secao>
        ) : null}

        {analise.recomendacoes.length > 0 ? (
          <Secao titulo="Recomendações">
            <ul className="relatorio-lista">
              {analise.recomendacoes.map((recomendacao) => (
                <li key={recomendacao.id_recomendacao}>
                  {recomendacao.texto}
                  {recomendacao.acatada ? ' (acatada)' : ''}
                </li>
              ))}
            </ul>
          </Secao>
        ) : null}

        <Secao titulo="Proposta avaliada">
          <dl className="relatorio-campos relatorio-campos--coluna">
            {ELEMENTOS_DA_PROPOSTA.map(([campo, rotulo]) => (
              <Campo key={campo} rotulo={rotulo}>{proposta?.[campo]}</Campo>
            ))}
          </dl>
        </Secao>

        {equipe ? (
          <Secao titulo="Equipe potencial considerada">
            <ul className="relatorio-lista">
              {equipe.membros
                .filter((membro) => membro.incluido)
                .map((membro) => (
                  <li key={membro.id_membro_equipe}>
                    {membro.nome} · {membro.papel_rotulo}
                    {membro.titulacao ? ` · ${membro.titulacao}` : ''} ·{' '}
                    {membro.disponibilidade}
                  </li>
                ))}
            </ul>
          </Secao>
        ) : null}

        {criterios.length > 0 ? (
          <Secao titulo={`Critérios de referência · versão ${analise.versao_criterios}`}>
            <ul className="relatorio-lista">
              {criterios.map((criterio) => (
                <li key={criterio.id_criterio}>
                  <strong>{criterio.codigo}</strong> · {criterio.dimensao_rotulo} ·{' '}
                  {criterio.descricao}
                </li>
              ))}
            </ul>
          </Secao>
        ) : null}

        <footer className="relatorio-documento__rodape">
          <Link to={`/oportunidades/${id}`}>{oportunidade.codigo}</Link> · AC2
          Microbiologia · gerado em {formatarData(relatorio.gerado_em)}
        </footer>
      </article>
    </div>
  )
}
