import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BackLink from '../../../components/console/BackLink'
import LayoutDoRelatorio, { SecaoDoRelatorio } from '../../../components/relatorio/LayoutDoRelatorio'
import ConteudoDaPreAnalise from '../../../components/relatorio/ConteudoDaPreAnalise'
import { formatarData } from '../../../components/relatorio/partesDoRelatorio'
import { obterRelatorioPreAnalise } from '../../../services/pdConnectApi'
import './RelatorioPage.scss'

const CODIGO_SEM_ANALISE = 'preanalise_inexistente'
const CODIGO_SEM_PROPOSTA = 'proposta_inexistente'

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

        <ConteudoDaPreAnalise
          analise={analise}
          comoLer={relatorio.como_ler || []}
          criterios={criterios}
          proposta={proposta}
          equipe={equipe}
          Bloco={SecaoDoRelatorio}
        />

        <footer className="relatorio-documento__rodape">
          <Link to={`/oportunidades/${id}`}>{oportunidade.codigo}</Link> · AC2
          Microbiologia · gerado em {formatarData(relatorio.gerado_em)}
        </footer>
      </article>
    </LayoutDoRelatorio>
  )
}
