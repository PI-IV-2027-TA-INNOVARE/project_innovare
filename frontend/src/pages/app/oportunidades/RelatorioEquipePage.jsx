import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BackLink from '../../../components/console/BackLink'
import LayoutDoRelatorio, { SecaoDoRelatorio } from '../../../components/relatorio/LayoutDoRelatorio'
import ConteudoDaEquipe from '../../../components/relatorio/ConteudoDaEquipe'
import { formatarData } from '../../../components/relatorio/partesDoRelatorio'
import { obterRelatorioEquipe } from '../../../services/pdConnectApi'
import './RelatorioPage.scss'

const CODIGO_SEM_EQUIPE = 'equipe_inexistente'

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

        <ConteudoDaEquipe
          equipe={equipe}
          comoFoiCalculado={relatorio.como_foi_calculado || []}
          competencias={competencias}
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
