import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BackLink from '../../../components/console/BackLink'
import LayoutDoRelatorio, { SecaoDoRelatorio } from '../../../components/relatorio/LayoutDoRelatorio'
import { PARCELAS_DA_NOTA, TERMOS } from '../../../lib/glossario'
import { obterRelatorioEquipe } from '../../../services/pdConnectApi'
import './RelatorioPage.scss'

const CODIGO_SEM_EQUIPE = 'equipe_inexistente'

const ROTULOS_DAS_FEATURES = PARCELAS_DA_NOTA

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

function porcentagem(valor) {
  if (valor === null || valor === undefined) return '—'

  return `${Math.round(Number(valor) * 100)}%`
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

export default function RelatorioEquipePage() {
  const { id } = useParams()

  const [relatorio, setRelatorio] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [semEquipe, setSemEquipe] = useState(false)

  const carregar = useCallback(() => {
    let ativo = true

    obterRelatorioEquipe(id)
      .then((dados) => {
        if (!ativo) return

        setRelatorio(dados)
        setErro('')
        setSemEquipe(false)
      })
      .catch((falha) => {
        if (!ativo) return

        setRelatorio(null)

        if (falha?.data?.codigo === CODIGO_SEM_EQUIPE) {
          setSemEquipe(true)
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

  if (semEquipe) {
    return (
      <div className="console relatorio-page">
        <BackLink to={`/oportunidades/${id}`}>Voltar para a oportunidade</BackLink>
        <p className="perfil-card__note">
          Esta oportunidade ainda não tem equipe potencial gerada. O relatório
          documenta o resultado de um matching — não há composição a imprimir
          antes dele.
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

  const { oportunidade, equipe, competencias } = relatorio
  const identificacao = [
    { rotulo: 'Código', valor: oportunidade.codigo },
    { rotulo: 'Situação', valor: oportunidade.situacao_rotulo },
    { rotulo: 'Gerado em', valor: formatarData(relatorio.gerado_em) },
  ]
  const execucao = equipe.execucao
  const incluidos = equipe.membros.filter((membro) => membro.incluido)

  return (
    <LayoutDoRelatorio
      voltarPara={`/oportunidades/${id}`}
      identificacao={identificacao}
    >

      <article className="relatorio-documento">
        <header className="relatorio-documento__header">
          <p className="relatorio-documento__kicker">Relatório de equipe potencial</p>
          <h1 className="relatorio-documento__titulo">{oportunidade.titulo}</h1>

          <p className="relatorio-documento__meta">
            <span className="relatorio-documento__codigo">{oportunidade.codigo}</span>
            <span>{oportunidade.origem_rotulo}</span>
            <span>Gerada em {formatarData(equipe.data_geracao)}</span>
          </p>

          <p className="relatorio-documento__aviso">
            Composição sugerida para validação do Supervisor. Não é convocação:
            não há convite, aceite nem recusa.
          </p>
        </header>

        {relatorio.como_foi_calculado?.length > 0 ? (
          <Secao titulo="Como foi calculado">
            {relatorio.como_foi_calculado.map((paragrafo) => (
              <p key={paragrafo} className="relatorio-texto">{paragrafo}</p>
            ))}
          </Secao>
        ) : null}

        {execucao ? (
          <Secao titulo="Rodada do matching">
            <dl className="relatorio-campos">
              <Campo rotulo="Estratégia">{execucao.estrategia}</Campo>
              <Campo rotulo={TERMOS.revisaoDaIa}>{execucao.usou_rerank ? 'sim' : 'não'}</Campo>
              <Campo rotulo={PARCELAS_DA_NOTA.semantico}>
                {execucao.fallback_usado ? 'indisponível na rodada' : 'aplicada'}
              </Campo>
              <Campo rotulo="Executada por">{execucao.executado_por}</Campo>
            </dl>

            {execucao.pesos?.componentes ? (
              <dl className="relatorio-campos">
                {Object.entries(execucao.pesos.componentes).map(([nome, peso]) => (
                  <Campo key={nome} rotulo={ROTULOS_DAS_FEATURES[nome] || nome}>
                    peso {peso}
                  </Campo>
                ))}
              </dl>
            ) : null}
          </Secao>
        ) : null}

        <Secao titulo="Composição sugerida">
          {incluidos.length > 0 ? (
            <dl className="relatorio-campos relatorio-campos--coluna">
              {incluidos.map((membro) => (
                <Campo
                  key={membro.id_membro_equipe}
                  rotulo={`${membro.nome} · ${membro.papel_rotulo} · aderência ${porcentagem(
                    membro.score_compatibilidade,
                  )}`}
                >
                  <span>
                    {membro.titulacao ? `${membro.titulacao} · ` : ''}
                    {membro.disponibilidade} · {membro.origem_rotulo}
                    {membro.validada ? ' · validada' : ''}
                  </span>

                  {membro.match_reasons?.length > 0 ? (
                    <ul className="relatorio-lista">
                      {membro.match_reasons.map((motivo, indice) => (
                        <li key={`${membro.id_membro_equipe}-${indice}`}>{motivo}</li>
                      ))}
                    </ul>
                  ) : null}
                </Campo>
              ))}
            </dl>
          ) : (
            <p className="relatorio-vazio">
              Nenhuma pessoa na composição atual. As lacunas abaixo dizem quais
              competências ficaram sem cobertura.
            </p>
          )}
        </Secao>

        <Secao titulo="Competências comparadas">
          {competencias.length > 0 ? (
            <ul className="relatorio-lista">
              {competencias.map((competencia) => (
                <li key={competencia.id_competencia_necessaria}>
                  {competencia.descricao} · {competencia.nivel_rotulo}
                  {competencia.no_vocabulario ? ' · no vocabulário da rede' : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="relatorio-vazio">Nenhuma competência necessária registrada.</p>
          )}
        </Secao>

        {equipe.lacunas.length > 0 ? (
          <Secao titulo="Lacunas da composição">
            <ul className="relatorio-lista">
              {equipe.lacunas.map((lacuna) => (
                <li key={lacuna.id_lacuna_equipe}>{lacuna.descricao}</li>
              ))}
            </ul>
          </Secao>
        ) : null}

        <footer className="relatorio-documento__rodape">
          <Link to={`/oportunidades/${id}`}>{oportunidade.codigo}</Link> · AC2
          Microbiologia · gerado em {formatarData(relatorio.gerado_em)}
        </footer>
      </article>
    </LayoutDoRelatorio>
  )
}
