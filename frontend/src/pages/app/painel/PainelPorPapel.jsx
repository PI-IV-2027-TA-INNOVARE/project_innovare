import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icone, appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { ROLES } from '../../../lib/roles'
import {
  listOportunidades,
  listarRede,
  obterMeuPerfil,
} from '../../../services/pdConnectApi'
import {
  agruparPorSituacao,
  daApi,
  resumoPorSituacao,
  situacaoLabel,
} from '../oportunidades/oportunidadesData'
import { resumoDoDemandante } from '../problemas/problemasData'
import { completudeDoPerfil, membroDaApi, perfilDaApi } from '../rede/redeData'

function Tile({ icon, label, value, tone, to }) {
  const conteudo = (
    <>
      <Icone icon={icon} className="stat-card__icon" />
      <div>
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value}</p>
      </div>
    </>
  )

  const className = `stat-card${tone ? ` stat-card--${tone}` : ''}`

  if (!to) {
    return <article className={className}>{conteudo}</article>
  }

  return (
    <Link className={`${className} stat-card--link`} to={to}>
      {conteudo}
      <Icone icon={appIcons.next} className="stat-card__seta" />
    </Link>
  )
}

function ListaDeOportunidades({ itens, vazio, base = '/oportunidades' }) {
  if (itens.length === 0) {
    return <p className="painel-lista__vazio">{vazio}</p>
  }

  return (
    <ul className="painel-lista">
      {itens.map((item) => (
        <li key={item.id}>
          <Link className="painel-lista__item" to={`${base}/${item.id}`}>
            <span className="painel-lista__texto">
              <span className="painel-lista__titulo">{item.titulo}</span>
              <span className="painel-lista__meta">
                {item.id} · atualizada {formatarUltimoAcesso(item.atualizadaEm).toLowerCase()}
              </span>
            </span>
            <span className={`fluxo-badge fluxo-badge--${item.situacao}`}>
              {situacaoLabel(item.situacao)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function BlocoSupervisor({ oportunidades, rede }) {
  const indicadores = resumoPorSituacao(oportunidades)

  const aguardando = oportunidades
    .filter((item) => item.situacao === 'aguardando_decisao')
    .slice(0, 3)

  const semCompetencia = rede.filter((pessoa) => pessoa.competencias.length === 0).length

  return (
    <>
      <div className="stat-grid">
        <Tile
          icon={appIcons.folder}
          label="Oportunidades"
          value={indicadores.total}
          to="/oportunidades"
        />
        <Tile
          icon={appIcons.flow}
          label="Em andamento"
          value={indicadores.emAndamento}
          tone="ok"
          to="/oportunidades"
        />
        <Tile
          icon={appIcons.decision}
          label="Aguardando sua decisão"
          value={indicadores.aguardandoDecisao}
          to="/oportunidades?situacao=aguardando_decisao"
        />
        <Tile
          icon={appIcons.warning}
          label="Perfis invisíveis ao matching"
          value={semCompetencia}
          tone={semCompetencia > 0 ? 'alert' : undefined}
          to="/rede"
        />
      </div>

      <section className="painel-secao">
        <div className="painel-secao__header">
          <h2 className="painel-secao__titulo">Oportunidades por etapa</h2>
          <Link className="link-button" to="/oportunidades">Ver a fila</Link>
        </div>

        {oportunidades.length > 0 ? (
          <ul className="painel-etapas">
            {agruparPorSituacao(oportunidades).map((situacao) => (
              <li key={situacao.id}>
                <Link className="painel-etapa" to={`/oportunidades?situacao=${situacao.id}`}>
                  <span className={`fluxo-badge fluxo-badge--${situacao.id}`}>
                    {situacao.label}
                  </span>
                  <span className="painel-etapa__total">{situacao.total}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="painel-lista__vazio">Nenhuma oportunidade na fila ainda.</p>
        )}

        <p className="painel-secao__nota">
          Cada etapa abre a fila já filtrada por ela.
        </p>
      </section>

      <section className="painel-secao">
        <div className="painel-secao__header">
          <h2 className="painel-secao__titulo">Esperando sua decisão</h2>
          <Link className="link-button" to="/oportunidades?situacao=aguardando_decisao">
            Ver a fila
          </Link>
        </div>

        <ListaDeOportunidades
          itens={aguardando}
          vazio="Nenhuma oportunidade aguardando decisão no momento."
        />
      </section>
    </>
  )
}

function BlocoPesquisador({ oportunidades, perfil }) {
  const completude = completudeDoPerfil(perfil || {})

  return (
    <>
      <div className="stat-grid">
        <Tile
          icon={appIcons.folder}
          label="Oportunidades comigo"
          value={oportunidades.length}
          to="/oportunidades"
        />
        <Tile
          icon={appIcons.profile}
          label="Perfil completo"
          value={`${completude.percentual}%`}
          tone={completude.percentual === 100 ? 'ok' : undefined}
          to="/perfil"
        />
      </div>

      <section className="painel-secao">
        <div className="painel-secao__header">
          <h2 className="painel-secao__titulo">Onde você foi indicado</h2>
          <Link className="link-button" to="/oportunidades">Ver todas</Link>
        </div>

        <ListaDeOportunidades
          itens={oportunidades.slice(0, 3)}
          vazio="Você ainda não integra nenhuma equipe potencial."
        />

        <p className="painel-secao__nota">
          A composição da equipe é sugerida pelo matching e validada pelo
          Supervisor — não há convite para aceitar ou recusar.
        </p>
      </section>
    </>
  )
}

function BlocoDemandante({ oportunidades }) {
  const indicadores = resumoDoDemandante(oportunidades)

  return (
    <>
      <div className="stat-grid">
        <Tile
          icon={appIcons.folder}
          label="Problemas cadastrados"
          value={indicadores.total}
          to="/problemas"
        />
        <Tile
          icon={appIcons.flow}
          label="Em análise pela AC2"
          value={indicadores.emAnalise}
          tone="ok"
          to="/problemas"
        />
        <Tile
          icon={appIcons.warning}
          label="Aguardando você"
          value={indicadores.aguardandoVoce}
          tone={indicadores.aguardandoVoce > 0 ? 'alert' : undefined}
          to="/problemas?situacao=revisar"
        />
      </div>

      <section className="painel-secao">
        <div className="painel-secao__header">
          <h2 className="painel-secao__titulo">Seus problemas</h2>
          <Link className="link-button" to="/problemas">Ver todos</Link>
        </div>

        <ListaDeOportunidades
          itens={oportunidades.slice(0, 3)}
          base="/problemas"
          vazio="Você ainda não cadastrou nenhum problema."
        />

        <p className="painel-secao__nota">
          O acompanhamento é dos seus próprios registros. As decisões internas de
          equipe e continuidade são do Núcleo de P&amp;D da AC2.
        </p>
      </section>
    </>
  )
}

export default function PainelPorPapel({ user }) {
  const papel = user?.role

  const [oportunidades, setOportunidades] = useState([])
  const [rede, setRede] = useState([])
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!papel || papel === ROLES.ADMINISTRADOR) {
      setCarregando(false)
      return
    }

    setCarregando(true)
    setErro('')

    try {
      const fila = await listOportunidades()
      setOportunidades((fila.results || fila).map(daApi))

      if (papel === ROLES.SUPERVISOR) {
        const membros = await listarRede()
        setRede((membros.results || membros).map(membroDaApi))
      }

      if (papel === ROLES.PESQUISADOR) {
        const meu = await obterMeuPerfil().catch(() => null)
        setPerfil(meu ? perfilDaApi(meu) : null)
      }
    } catch (falha) {
      setOportunidades([])
      setErro(falha?.message || 'Não foi possível carregar o painel.')
    } finally {
      setCarregando(false)
    }
  }, [papel])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (!papel || papel === ROLES.ADMINISTRADOR) return null

  if (carregando) {
    return (
      <p className="painel-lista__vazio" role="status">Carregando o seu painel...</p>
    )
  }

  if (erro) {
    return (
      <div className="admin-callout" role="alert">
        <Icone icon={appIcons.warning} className="admin-callout__icon" />
        <p className="admin-callout__text">{erro}</p>
        <button type="button" className="link-button" onClick={carregar}>
          Tentar de novo
        </button>
      </div>
    )
  }

  if (papel === ROLES.SUPERVISOR) {
    return <BlocoSupervisor oportunidades={oportunidades} rede={rede} />
  }

  if (papel === ROLES.PESQUISADOR) {
    return <BlocoPesquisador oportunidades={oportunidades} perfil={perfil} />
  }

  return <BlocoDemandante oportunidades={oportunidades} />
}
