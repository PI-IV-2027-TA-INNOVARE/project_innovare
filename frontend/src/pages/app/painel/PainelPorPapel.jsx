import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { ROLES } from '../../../lib/roles'
import {
  OPORTUNIDADES_EXEMPLO,
  agruparPorSituacao,
  disponibilizadasPara,
  resumoPorSituacao,
  situacaoLabel,
} from '../oportunidades/oportunidadesData'
import { problemasDe, resumoDoDemandante } from '../problemas/problemasData'
import { REDE_EXEMPLO, completudeDoPerfil } from '../rede/redeData'

function Tile({ icon, label, value, tone, to }) {
  const conteudo = (
    <>
      <FontAwesomeIcon icon={icon} className="stat-card__icon" />
      <div>
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value}</p>
      </div>
    </>
  )

  const className = `stat-card${tone ? ` stat-card--${tone}` : ''}`

  return to ? (
    <Link className={className} to={to}>{conteudo}</Link>
  ) : (
    <article className={className}>{conteudo}</article>
  )
}

function ListaDeOportunidades({ itens, vazio, base = '/oportunidades' }) {
  if (itens.length === 0) {
    return <p className="painel-lista__vazio">{vazio}</p>
  }

  return (
    <ul className="painel-lista">
      {itens.map((item) => {
        const conteudo = (
          <>
            <span className="painel-lista__texto">
              <span className="painel-lista__titulo">{item.titulo}</span>
              <span className="painel-lista__meta">
                {item.id} · atualizada {formatarUltimoAcesso(item.atualizadaEm).toLowerCase()}
              </span>
            </span>
            <span className={`fluxo-badge fluxo-badge--${item.situacao}`}>
              {situacaoLabel(item.situacao)}
            </span>
          </>
        )

        return (
          <li key={item.id}>
            <Link className="painel-lista__item" to={`${base}/${item.id}`}>
              {conteudo}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function BlocoSupervisor() {
  const indicadores = resumoPorSituacao(OPORTUNIDADES_EXEMPLO)

  const aguardando = OPORTUNIDADES_EXEMPLO
    .filter((item) => item.situacao === 'aguardando_decisao')
    .slice(0, 3)

  const semCompetencia = REDE_EXEMPLO.filter((pessoa) => pessoa.competencias.length === 0).length

  return (
    <>
      <div className="stat-grid">
        <Tile icon={appIcons.folder} label="Oportunidades" value={indicadores.total} to="/oportunidades" />
        <Tile icon={appIcons.flow} label="Em andamento" value={indicadores.emAndamento} tone="ok" to="/oportunidades" />
        <Tile icon={appIcons.decision} label="Aguardando sua decisão" value={indicadores.aguardandoDecisao} to="/oportunidades" />
        <Tile icon={appIcons.warning} label="Perfis invisíveis ao matching" value={semCompetencia} tone="alert" to="/rede" />
      </div>

      <section className="painel-secao">
        <div className="painel-secao__header">
          <h2 className="painel-secao__titulo">Oportunidades por etapa</h2>
          <Link className="link-button" to="/oportunidades">Ver a fila</Link>
        </div>

        <ul className="painel-etapas">
          {agruparPorSituacao(OPORTUNIDADES_EXEMPLO).map((situacao) => (
            <li key={situacao.id}>
              <Link
                className="painel-etapa"
                to={`/oportunidades?situacao=${situacao.id}`}
              >
                <span className={`fluxo-badge fluxo-badge--${situacao.id}`}>
                  {situacao.label}
                </span>
                <span className="painel-etapa__total">{situacao.total}</span>
              </Link>
            </li>
          ))}
        </ul>

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

function BlocoPesquisador({ nome }) {
  const minhas = disponibilizadasPara(nome)

  const completude = completudeDoPerfil({
    titulacao: 'mestrado',
    competencias: ['Microbiologia de alimentos', 'Fermentação'],
    tecnicas: ['PCR em tempo real'],
    linhas: ['Bioinsumos agrícolas'],
    experiencia: '',
    disponibilidade: 'parcial',
  })

  return (
    <>
      <div className="stat-grid">
        <Tile icon={appIcons.folder} label="Oportunidades comigo" value={minhas.length} to="/oportunidades" />
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
          itens={minhas.slice(0, 3)}
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

function BlocoDemandante({ nome }) {
  const meus = problemasDe(nome)
  const indicadores = resumoDoDemandante(meus)

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
          to="/problemas"
        />
      </div>

      <section className="painel-secao">
        <div className="painel-secao__header">
          <h2 className="painel-secao__titulo">Seus problemas</h2>
          <Link className="link-button" to="/problemas">Ver todos</Link>
        </div>

        <ListaDeOportunidades
          itens={meus.slice(0, 3)}
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
  if (user?.role === ROLES.SUPERVISOR) return <BlocoSupervisor />
  if (user?.role === ROLES.PESQUISADOR) return <BlocoPesquisador nome={user?.displayName || ''} />
  if (user?.role === ROLES.DEMANDANTE) return <BlocoDemandante nome={user?.displayName || ''} />

  return null
}
