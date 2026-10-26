import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BackLink from '../../../components/console/BackLink'
import LayoutDoRelatorio, { SecaoDoRelatorio } from '../../../components/relatorio/LayoutDoRelatorio'
import { obterRelatorioOportunidade } from '../../../services/pdConnectApi'
import './RelatorioPage.scss'

const ROTULOS_DAS_SECOES = {
  proposta_estruturada: 'Proposta estruturada',
  competencias_necessarias: 'Competências necessárias',
  equipe_potencial: 'Equipe potencial',
  pre_analise: 'Pré-análise de maturidade',
}

const ELEMENTOS_DA_PROPOSTA = [
  ['problema_pesquisa', 'Problema de pesquisa'],
  ['hipotese', 'Hipótese'],
  ['objetivo_geral', 'Objetivo geral'],
  ['metodologia', 'Metodologia'],
  ['resultados_esperados', 'Resultados esperados'],
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

function formatarTamanho(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const Secao = SecaoDoRelatorio

function Campo({ rotulo, children }) {
  return (
    <div className="relatorio-campo">
      <dt className="relatorio-campo__rotulo">{rotulo}</dt>
      <dd className="relatorio-campo__valor">{children || '—'}</dd>
    </div>
  )
}

export default function RelatorioPage() {
  const { id } = useParams()

  const [relatorio, setRelatorio] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(() => {
    let ativo = true

    obterRelatorioOportunidade(id)
      .then((dados) => {
        if (ativo) {
          setRelatorio(dados)
          setErro('')
        }
      })
      .catch((falha) => {
        if (ativo) {
          setRelatorio(null)
          setErro(falha?.message || 'Não foi possível carregar o relatório.')
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

  if (erro) {
    return (
      <div className="console relatorio-page">
        <BackLink to={`/oportunidades/${id}`}>Voltar para a oportunidade</BackLink>
        <p className="admin-field__error" role="alert">{erro}</p>
      </div>
    )
  }

  const { oportunidade, anexos, historico, decisao, proposta, pendentes } = relatorio
  const identificacao = [
    { rotulo: 'Código', valor: oportunidade.codigo },
    { rotulo: 'Situação', valor: oportunidade.situacao_rotulo },
    { rotulo: 'Gerado em', valor: formatarData(relatorio.gerado_em) },
  ]

  return (
    <LayoutDoRelatorio
      voltarPara={`/oportunidades/${id}`}
      identificacao={identificacao}
    >

      <article className="relatorio-documento">
        <header className="relatorio-documento__header">
          <p className="relatorio-documento__kicker">Relatório de oportunidade</p>
          <h1 className="relatorio-documento__titulo">{oportunidade.titulo}</h1>

          <p className="relatorio-documento__meta">
            <span className="relatorio-documento__codigo">{oportunidade.codigo}</span>
            <span>{oportunidade.origem_rotulo}</span>
            <span>{oportunidade.situacao_rotulo}</span>
          </p>

          <p className="relatorio-documento__carimbo" data-testid="relatorio-gerado-em">
            Documento gerado em {formatarData(relatorio.gerado_em)}
          </p>
        </header>

        <Secao titulo="Entrada">
          <dl className="relatorio-campos">
            <Campo rotulo="Demandante">{oportunidade.demandante_nome}</Campo>
            <Campo rotulo="Responsável">{oportunidade.responsavel_nome}</Campo>
            <Campo rotulo="Cadastrada em">{formatarData(oportunidade.criada_em)}</Campo>
            <Campo rotulo="Atualizada em">
              {formatarData(oportunidade.atualizada_em)}
            </Campo>
          </dl>

          <h3 className="relatorio-subtitulo">Resumo</h3>
          <p className="relatorio-texto">{oportunidade.resumo || '—'}</p>

          <h3 className="relatorio-subtitulo">Contexto</h3>
          <p className="relatorio-texto">{oportunidade.contexto || '—'}</p>
        </Secao>

        {proposta ? (
          <Secao titulo="Proposta estruturada">
            <dl className="relatorio-campos relatorio-campos--coluna">
              {ELEMENTOS_DA_PROPOSTA.map(([campo, rotulo]) => (
                <Fragment key={campo}>
                  <Campo rotulo={rotulo}>{proposta[campo]}</Campo>

                  {campo === 'objetivo_geral' ? (
                    <Campo rotulo="Objetivos específicos">
                      {proposta.objetivos_especificos?.length > 0 ? (
                        <ul className="relatorio-lista">
                          {proposta.objetivos_especificos.map((objetivo) => (
                            <li key={objetivo}>{objetivo}</li>
                          ))}
                        </ul>
                      ) : null}
                    </Campo>
                  ) : null}
                </Fragment>
              ))}
            </dl>

            <p className="relatorio-nota">
              {proposta.revisada_por_humano
                ? `Revisada por uma pessoa — versão ${proposta.versao}.`
                : `Ainda sem revisão humana registrada — versão ${proposta.versao}.`}
            </p>
          </Secao>
        ) : null}

        <Secao titulo="Anexos">
          {anexos.length > 0 ? (
            <ul className="relatorio-anexos">
              {anexos.map((anexo) => (
                <li key={anexo.id_anexo}>
                  <span className="relatorio-anexos__nome">{anexo.nome_original}</span>
                  <span className="relatorio-anexos__meta">
                    {formatarTamanho(anexo.tamanho_bytes)}
                    {anexo.enviado_por_nome ? ` · ${anexo.enviado_por_nome}` : ''}
                    {` · ${formatarData(anexo.criado_em)}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="relatorio-vazio">Nenhum documento anexado à oportunidade.</p>
          )}
        </Secao>

        <Secao titulo="Decisão">
          {decisao ? (
            <dl className="relatorio-campos relatorio-campos--coluna">
              <Campo rotulo="Desfecho">{decisao.tipo_rotulo}</Campo>
              <Campo rotulo="Justificativa">{decisao.justificativa}</Campo>
              <Campo rotulo="Registrada por">{decisao.autor_nome}</Campo>
              <Campo rotulo="Registrada em">
                {formatarData(decisao.registrada_em)}
              </Campo>
            </dl>
          ) : (
            <p className="relatorio-vazio">
              A decisão ainda não foi registrada para esta oportunidade.
            </p>
          )}
        </Secao>

        <Secao titulo="Histórico">
          {historico.length > 0 ? (
            <ol className="relatorio-trilha">
              {historico.map((evento, indice) => (
                <li key={`${evento.tipo}-${evento.ocorrido_em}-${indice}`}>
                  <span className="relatorio-trilha__quando">
                    {formatarData(evento.ocorrido_em)}
                  </span>
                  <span className="relatorio-trilha__o-que">{evento.tipo}</span>
                  <span className="relatorio-trilha__quem">
                    {evento.ator_nome || evento.ator}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="relatorio-vazio">Nenhum evento registrado.</p>
          )}
        </Secao>

        {pendentes.length > 0 ? (
          <Secao titulo="Ainda não disponível">
            <dl className="relatorio-campos relatorio-campos--coluna">
              {pendentes.map((item) => (
                <Campo
                  key={item.secao}
                  rotulo={ROTULOS_DAS_SECOES[item.secao] || item.secao}
                >
                  {item.motivo}
                </Campo>
              ))}
            </dl>
          </Secao>
        ) : null}

        <footer className="relatorio-documento__rodape">
          <Link to={`/oportunidades/${id}`}>{oportunidade.codigo}</Link> · AC2
          Microbiologia
        </footer>
      </article>
    </LayoutDoRelatorio>
  )
}
