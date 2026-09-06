import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { ROLES } from '../../../lib/roles'
import {
  OPORTUNIDADES_EXEMPLO,
  disponibilizadasPara,
  resumoPorSituacao,
  situacaoLabel,
} from '../oportunidades/oportunidadesData'
import { REDE_EXEMPLO, completudeDoPerfil } from '../rede/redeData'

/**
 * Conteúdo do painel por papel.
 *
 * O painel é a porta de entrada de cada ator, e "porta de entrada" quer dizer
 * responder a uma pergunta só: **o que espera por mim agora?** Por isso cada
 * papel vê números diferentes — e o Pesquisador não vê fila de decisão nenhuma,
 * porque decidir não é dele (RN-A07).
 *
 * Dados de exemplo locais, como no resto da Fase 2/3.1.
 */

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

/**
 * `linkavel` existe porque o destino não serve a todo mundo: o Demandante
 * acompanha os PRÓPRIOS problemas em `/problemas/:id`, e `/oportunidades/:id` é
 * rota de Supervisor e Pesquisador. Link que leva a "acesso restrito" é pior que
 * item sem link — parece defeito, e o usuário culpa a plataforma.
 */
function ListaDeOportunidades({ itens, vazio, linkavel = true }) {
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
            {linkavel ? (
              <Link className="painel-lista__item" to={`/oportunidades/${item.id}`}>
                {conteudo}
              </Link>
            ) : (
              <div className="painel-lista__item is-static">{conteudo}</div>
            )}
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
          <h2 className="painel-secao__titulo">Esperando sua decisão</h2>
          <Link className="link-button" to="/oportunidades">Ver a fila</Link>
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

  // O perfil do exemplo local nasce sem experiência preenchida — é o que a
  // barra do /perfil mostra, e o painel repete o número para dar o empurrão.
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

        {/*
          Dito na tela, não só na documentação: o matching sugere, o Supervisor
          valida. Sem isso o pesquisador procura o botão de aceitar (RN-A06).
        */}
        <p className="painel-secao__nota">
          A composição da equipe é sugerida pelo matching e validada pelo
          Supervisor — não há convite para aceitar ou recusar.
        </p>
      </section>
    </>
  )
}

function BlocoDemandante({ nome }) {
  // Pelo usuário, nunca por nome fixo: com a organização escrita no código,
  // qualquer Demandante que entrasse veria os problemas de outra empresa.
  const meus = OPORTUNIDADES_EXEMPLO.filter((item) => item.demandante === nome)

  return (
    <>
      <div className="stat-grid">
        <Tile icon={appIcons.folder} label="Problemas cadastrados" value={meus.length} />
        <Tile
          icon={appIcons.flow}
          label="Em análise pela AC2"
          value={meus.filter((item) => item.situacao !== 'arquivada').length}
          tone="ok"
        />
      </div>

      <section className="painel-secao">
        <div className="painel-secao__header">
          <h2 className="painel-secao__titulo">Seus problemas</h2>
        </div>

        <ListaDeOportunidades
          itens={meus}
          linkavel={false}
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
