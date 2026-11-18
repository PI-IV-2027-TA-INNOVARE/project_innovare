import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BackLink from '../../../components/console/BackLink'
import ConteudoDaEquipe from '../../../components/relatorio/ConteudoDaEquipe'
import ConteudoDaPreAnalise from '../../../components/relatorio/ConteudoDaPreAnalise'
import LayoutDoRelatorio, {
  SecaoDoRelatorio,
  SubsecaoDoRelatorio,
} from '../../../components/relatorio/LayoutDoRelatorio'
import {
  Campo,
  SeloDeMaturidade,
  TextoFormatado,
  formatarData,
  porGravidade,
} from '../../../components/relatorio/partesDoRelatorio'
import { obterRelatorioOportunidade } from '../../../services/pdConnectApi'
import { eventoDaApi } from './oportunidadesData'
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

function formatarTamanho(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const Secao = SecaoDoRelatorio

const plural = (total, singular, varios) => `${total} ${total === 1 ? singular : varios}`

function situacaoDaProposta(proposta) {
  if (!proposta) return 'Não iniciada'

  if (!proposta.revisada_por_humano) return `Sem revisão humana, versão ${proposta.versao}`

  return proposta.revisor_nome
    ? `Revisada por ${proposta.revisor_nome}, versão ${proposta.versao}`
    : `Revisada, versão ${proposta.versao}`
}

function MaturidadePorNivel({ dimensoes }) {
  const niveis = []

  porGravidade(dimensoes).forEach((dimensao) => {
    const nivel = niveis.find((item) => item.nivel === dimensao.nivel)

    if (nivel) nivel.total += 1
    else niveis.push({ nivel: dimensao.nivel, rotulo: dimensao.nivel_rotulo, total: 1 })
  })

  return (
    <span className="relatorio-selos">
      {niveis.map((item) => (
        <SeloDeMaturidade
          key={item.nivel}
          nivel={item.nivel}
          rotulo={`${item.total} ${String(item.rotulo || '').toLowerCase()}`}
        />
      ))}
    </span>
  )
}

function VisaoGeral({ oportunidade, decisao, proposta, competencias, equipe, analise }) {
  const essenciais = competencias.filter(
    (competencia) => competencia.nivel_importancia === 'essencial',
  ).length
  const incluidos = equipe ? equipe.membros.filter((membro) => membro.incluido) : []
  const validada = incluidos.length > 0 && incluidos.every((membro) => membro.validada)
  const dimensoes = analise?.dimensoes || []
  const recomendacoes = analise?.recomendacoes || []
  const acatadas = recomendacoes.filter((recomendacao) => recomendacao.acatada).length

  let maturidade = 'Pré-análise não executada'
  if (dimensoes.length > 0) maturidade = <MaturidadePorNivel dimensoes={dimensoes} />
  else if (analise) maturidade = analise.status_rotulo || 'Sem resultado'

  return (
    <Secao titulo="Visão geral">
      {!decisao ? (
        <p className="relatorio-aviso">Documento parcial: a decisão ainda não foi registrada.</p>
      ) : null}

      <dl className="relatorio-campos">
        <Campo rotulo="Decisão">{decisao ? decisao.tipo_rotulo : 'Pendente'}</Campo>
        <Campo rotulo="Responsável">{oportunidade.responsavel_nome || 'Não definido'}</Campo>
        <Campo rotulo="Proposta">{situacaoDaProposta(proposta)}</Campo>
        <Campo rotulo="Competências">
          {competencias.length > 0
            ? `${plural(competencias.length, 'competência', 'competências')}, ${plural(essenciais, 'essencial', 'essenciais')}`
            : 'Nenhuma identificada'}
        </Campo>
        <Campo rotulo="Equipe potencial">
          {equipe
            ? [
                plural(incluidos.length, 'pessoa', 'pessoas'),
                plural(equipe.lacunas.length, 'lacuna de competência', 'lacunas de competência'),
                validada ? 'validada' : 'não validada',
              ].join(' · ')
            : 'Matching não executado'}
        </Campo>
        <Campo rotulo="Maturidade">{maturidade}</Campo>
        <Campo rotulo="Recomendações">
          {recomendacoes.length > 0
            ? `${acatadas} de ${recomendacoes.length} ${recomendacoes.length === 1 ? 'acatada' : 'acatadas'}`
            : 'Nenhuma'}
        </Campo>
      </dl>

      {analise?.sintese ? (
        <>
          <h3 className="relatorio-subtitulo">Síntese da pré-análise</h3>
          <TextoFormatado texto={analise.sintese} />
        </>
      ) : null}
    </Secao>
  )
}

function notaDaRevisao(proposta) {
  if (!proposta.revisada_por_humano) {
    return `Ainda sem revisão humana registrada — versão ${proposta.versao}.`
  }

  return proposta.revisor_nome
    ? `Revisada por ${proposta.revisor_nome} — versão ${proposta.versao}.`
    : `Revisada por uma pessoa — versão ${proposta.versao}.`
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

  const {
    oportunidade,
    anexos,
    historico,
    decisao,
    proposta,
    competencias = [],
    equipe = null,
    pre_analise: analise = null,
    pendentes,
  } = relatorio
  const eventos = historico.map(eventoDaApi).sort((a, b) => a.em - b.em)
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

        <VisaoGeral
          oportunidade={oportunidade}
          decisao={decisao}
          proposta={proposta}
          competencias={competencias}
          equipe={equipe}
          analise={analise}
        />

        <Secao titulo="Entrada">
          <dl className="relatorio-campos">
            <Campo rotulo="Demandante">{oportunidade.demandante_nome}</Campo>
            <Campo rotulo="Responsável">{oportunidade.responsavel_nome || 'Não definido'}</Campo>
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
                  <Campo rotulo={rotulo}>
                    {proposta[campo] ? <TextoFormatado texto={proposta[campo]} /> : null}
                  </Campo>

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

            <p className="relatorio-nota">{notaDaRevisao(proposta)}</p>
          </Secao>
        ) : null}

        {competencias.length > 0 ? (
          <Secao titulo="Competências necessárias">
            <ul className="relatorio-lista">
              {competencias.map((competencia) => (
                <li key={competencia.id_competencia_necessaria}>
                  {competencia.descricao} · {competencia.nivel_rotulo} ·{' '}
                  {competencia.derivada_rotulo}
                </li>
              ))}
            </ul>
          </Secao>
        ) : null}

        {equipe ? (
          <Secao titulo="Equipe potencial">
            <p className="relatorio-nota">
              Composição sugerida para validação do Supervisor. Não é convocação:
              não há convite, aceite nem recusa.
            </p>

            <ConteudoDaEquipe
              equipe={equipe}
              comoFoiCalculado={relatorio.como_foi_calculado || []}
              Bloco={SubsecaoDoRelatorio}
            />
          </Secao>
        ) : null}

        {analise ? (
          <Secao titulo="Pré-análise de maturidade">
            <p className="relatorio-nota">{analise.aviso}</p>

            <ConteudoDaPreAnalise
              analise={analise}
              comoLer={relatorio.como_ler || []}
              criterios={relatorio.criterios || []}
              mostrarSintese={false}
              Bloco={SubsecaoDoRelatorio}
            />
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
          {eventos.length > 0 ? (
            <ol className="relatorio-trilha">
              {eventos.map((evento) => (
                <li key={evento.id}>
                  <span className="relatorio-trilha__quando">{formatarData(evento.em)}</span>
                  <span className="relatorio-trilha__o-que">{evento.texto}</span>
                  <span className="relatorio-trilha__quem">{evento.ator}</span>
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
