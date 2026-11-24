import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BackLink from '../../../components/console/BackLink'
import { AdminToast, useToast } from '../../../components/console/toast'
import { useAuth } from '../../../context/AuthContext'
import { Icone, appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { ROLES } from '../../../lib/roles'
import {
  definirPrioridade,
  listarHistorico,
  obterOportunidade,
  registrarDecisao as registrarDecisaoNaApi,
} from '../../../services/pdConnectApi'
import AnexosOportunidade from '../../../components/AnexosOportunidade'
import NaoEncontradaPage from '../../system/NaoEncontradaPage'
import AbaCompetencias from './abas/AbaCompetencias'
import AbaContexto from './abas/AbaContexto'
import AbaCopiloto from './abas/AbaCopiloto'
import AbaDecisao from './abas/AbaDecisao'
import AbaEquipe from './abas/AbaEquipe'
import AbaHistorico from './abas/AbaHistorico'
import AbaPreAnalise from './abas/AbaPreAnalise'
import AbaProposta from './abas/AbaProposta'
import {
  CONCLUIDA,
  EM_ANDAMENTO,
  ETAPAS,
  REGISTROS,
  andamentoDasEtapas,
  etapaDaSituacao,
  etapaPorId,
} from './etapas'
import {
  PRIORIDADES,
  daApi,
  eventoDaApi,
  origemLabel,
  prioridadeLabel,
  situacaoLabel,
} from './oportunidadesData'
import './OportunidadesPage.scss'

const ABAS = [...ETAPAS, ...REGISTROS]

const FORMATO_DO_CODIGO = /^OP-\d{4}-\d{3,}$/

const VOLTA_PARA_A_LISTA = { to: '/oportunidades', label: 'Voltar para oportunidades' }

const AVISO_DA_PROPOSTA = 'Há alterações não salvas na proposta. Sair desta etapa sem salvar?'

const AVISO_DAS_RESPOSTAS =
  'Há respostas ao Copiloto que não foram enviadas. Sair desta etapa sem enviar?'

const ESTADO_VISIVEL = {
  [CONCLUIDA]: 'concluída',
  [EM_ANDAMENTO]: 'em andamento',
}

function posicaoDa(etapa, andamento) {
  const estado = andamento[etapa.id]
  const atual = ETAPAS.find((item) => andamento[item.id] === EM_ANDAMENTO)

  if (!atual || estado === EM_ANDAMENTO) {
    const partes = [`Etapa ${etapa.numero} de ${ETAPAS.length}`]

    if (estado) partes.push(ESTADO_VISIVEL[estado])

    return { texto: partes.join(' · '), atual: null }
  }

  let comoEsta = 'que ainda não começou'
  if (estado === CONCLUIDA) comoEsta = 'já concluída'
  else if (etapa.numero === atual.numero + 1) comoEsta = 'a próxima'

  return {
    texto: `Você está vendo a etapa ${etapa.numero} de ${ETAPAS.length}, ${comoEsta}. Etapa atual: ${atual.numero}, ${atual.label}.`,
    atual,
  }
}

function BotaoAba({ item, ativa, bloqueada, onClick, andamento }) {
  const classes = [
    'oportunidade-aba',
    ativa ? 'is-active' : '',
    andamento === CONCLUIDA ? 'is-concluida' : '',
    andamento === EM_ANDAMENTO ? 'is-em-andamento' : '',
  ]

  return (
    <button
      type="button"
      className={classes.filter(Boolean).join(' ')}
      aria-current={ativa ? 'step' : undefined}
      disabled={bloqueada}
      onClick={onClick}
    >
      {item.numero ? (
        <span className="oportunidade-aba__numero" aria-hidden="true">
          {andamento === CONCLUIDA ? <Icone icon={appIcons.done} /> : item.numero}
        </span>
      ) : (
        <Icone icon={item.icon} className="oportunidade-aba__icon" />
      )}
      {item.label}
      {andamento === CONCLUIDA ? <span className="sr-only"> concluída</span> : null}
      {andamento === EM_ANDAMENTO ? <span className="sr-only"> em andamento</span> : null}
    </button>
  )
}

export default function OportunidadePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { toast, showToast } = useToast()

  const ehSupervisor = user?.role === ROLES.SUPERVISOR

  const [registro, setRegistro] = useState(null)
  const [eventos, setEventos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [abaAtiva, setAbaAtiva] = useState('contexto')
  const [abaOcupada, setAbaOcupada] = useState(false)
  const [rascunhoPendente, setRascunhoPendente] = useState('')
  const [campoEmFoco, setCampoEmFoco] = useState(null)
  const [matchingEmCurso, setMatchingEmCurso] = useState(false)
  const abaAberta = useRef(abaAtiva)
  const [naoEncontrada, setNaoEncontrada] = useState(false)
  const [bordas, setBordas] = useState({ antes: false, depois: false })
  const barraDeEtapas = useRef(null)

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (!FORMATO_DO_CODIGO.test(id)) {
      setCarregando(false)
      return
    }

    if (!silencioso) {
      setCarregando(true)
      setNaoEncontrada(false)
    }
    setErroCarga('')

    try {
      const [dados, trilha] = await Promise.all([
        obterOportunidade(id),
        listarHistorico(id).catch(() => []),
      ])

      const carregado = daApi(dados)

      setRegistro(carregado)
      setEventos((trilha.results || trilha).map(eventoDaApi))
      if (!silencioso) setAbaAtiva(etapaDaSituacao(carregado.situacao))
    } catch (falha) {
      if (!silencioso) {
        setRegistro(null)
        setNaoEncontrada(falha?.status === 404)
      }
      setErroCarga(falha?.message || 'Não foi possível carregar esta oportunidade.')
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    if (carregando) return

    barraDeEtapas.current
      ?.querySelector('[aria-current="step"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [carregando, abaAtiva])

  const medirBordas = useCallback(() => {
    const barra = barraDeEtapas.current

    if (!barra) return

    const antes = barra.scrollLeft > 1
    const depois = barra.scrollLeft + barra.clientWidth < barra.scrollWidth - 1

    setBordas((atual) =>
      atual.antes === antes && atual.depois === depois ? atual : { antes, depois },
    )
  }, [])

  useEffect(() => {
    const barra = barraDeEtapas.current

    if (carregando || !barra) return undefined

    medirBordas()
    barra.addEventListener('scroll', medirBordas, { passive: true })
    window.addEventListener('resize', medirBordas)

    return () => {
      barra.removeEventListener('scroll', medirBordas)
      window.removeEventListener('resize', medirBordas)
    }
  }, [carregando, medirBordas])

  const rolarEtapas = (sentido) => {
    const barra = barraDeEtapas.current

    barra?.scrollBy?.({ left: sentido * barra.clientWidth * 0.7, behavior: 'smooth' })
  }

  const atualizarEmSegundoPlano = useCallback(
    () => carregar({ silencioso: true }),
    [carregar],
  )

  useEffect(() => {
    abaAberta.current = abaAtiva
  }, [abaAtiva])

  const rodarMatching = useCallback(async (acao) => {
    setMatchingEmCurso(true)

    try {
      const resultado = await acao()

      if (abaAberta.current !== 'equipe') {
        showToast('A equipe potencial ficou pronta. Veja na etapa Equipe potencial.')
      }

      atualizarEmSegundoPlano()
      return resultado
    } catch (falha) {
      if (abaAberta.current !== 'equipe') {
        showToast(falha?.message || 'O matching não foi concluído.')
      }

      throw falha
    } finally {
      setMatchingEmCurso(false)
    }
  }, [atualizarEmSegundoPlano, showToast])

  const trocarAba = useCallback((destino) => {
    if (rascunhoPendente && !window.confirm(rascunhoPendente)) {
      return
    }

    setRascunhoPendente('')
    setAbaAtiva(destino)
  }, [rascunhoPendente])

  const alterouProposta = useCallback((alterado) => {
    setRascunhoPendente(alterado ? AVISO_DA_PROPOSTA : '')
  }, [])

  const alterouRespostas = useCallback((alterado) => {
    setRascunhoPendente(alterado ? AVISO_DAS_RESPOSTAS : '')
  }, [])

  const irPara = useCallback((destino, campo = null) => {
    trocarAba(destino)
    setCampoEmFoco(campo)
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }, [trocarAba])

  const focouCampo = useCallback(() => setCampoEmFoco(null), [])

  const mudarPrioridade = async (event) => {
    const prioridade = event.target.value

    try {
      await definirPrioridade(id, prioridade)
      setRegistro((atual) => ({ ...atual, prioridade }))
      showToast(`Prioridade ${prioridadeLabel(prioridade).toLowerCase()} na fila.`)
      await atualizarEmSegundoPlano()
    } catch (falha) {
      showToast(falha?.message || 'Não foi possível mudar a prioridade.')
    }
  }

  const registrarDecisao = async (tipo, justificativa) => {
    try {
      await registrarDecisaoNaApi(id, { tipo, justificativa })
      showToast('Decisão registrada no histórico.')
      await atualizarEmSegundoPlano()
    } catch (falha) {
      showToast(falha?.message || 'Não foi possível registrar a decisão.')
    }
  }

  const acrescentarNaTrilha = (evento) => {
    setEventos((atual) => [evento, ...atual])
  }

  if (!FORMATO_DO_CODIGO.test(id)) {
    return <NaoEncontradaPage voltar={VOLTA_PARA_A_LISTA} />
  }

  if (carregando) {
    return (
      <div className="console oportunidade-page">
        <BackLink to="/oportunidades">Voltar para oportunidades</BackLink>
        <p className="oportunidade-page__vazio" role="status">
          Carregando a oportunidade...
        </p>
      </div>
    )
  }

  if (!registro && naoEncontrada) {
    return (
      <NaoEncontradaPage
        titulo="Oportunidade não encontrada"
        texto={
          <>
            Não encontramos a oportunidade <code>{id}</code>. Ela pode não existir ou
            não estar disponível para o seu perfil.
          </>
        }
        voltar={VOLTA_PARA_A_LISTA}
      />
    )
  }

  if (!registro) {
    return (
      <div className="console oportunidade-page">
        <BackLink to="/oportunidades">Voltar para oportunidades</BackLink>
        <p className="oportunidade-page__vazio">
          Não foi possível carregar a oportunidade <code>{id}</code>.
          {erroCarga ? ` ${erroCarga}` : ''}
        </p>
        <button type="button" className="admin-btn admin-btn--outline" onClick={() => carregar()}>
          Tentar de novo
        </button>
      </div>
    )
  }

  const aba = ABAS.find((item) => item.id === abaAtiva) || ABAS[0]
  const decisao = registro.decisao
  const andamento = andamentoDasEtapas(registro.situacao)
  const etapaAtiva = etapaPorId(abaAtiva)
  const posicao = etapaAtiva ? posicaoDa(etapaAtiva, andamento) : null

  return (
    <div className="console oportunidade-page">
      <header className="oportunidade-page__header">
        <div className="oportunidade-page__topo">
          <BackLink to="/oportunidades">Voltar para oportunidades</BackLink>

          {ehSupervisor ? (
            <Link
              to={`/oportunidades/${id}/relatorio`}
              className="admin-btn admin-btn--outline"
            >
              <Icone icon={appIcons.view} />
              Relatório
            </Link>
          ) : null}
        </div>

        <h1 className="oportunidade-page__title">{registro.titulo}</h1>

        <p className="oportunidade-page__identidade">
          <span className="oportunidade-page__codigo">{registro.id}</span>
          <span className="oportunidade-page__demandante">{registro.demandante}</span>
        </p>

        <div className="oportunidade-page__meta">
          <span className={`fluxo-badge fluxo-badge--${registro.situacao}`}>
            {situacaoLabel(registro.situacao)}
          </span>
          <span className={`origem-badge origem-badge--${registro.origem}`}>
            {origemLabel(registro.origem)}
          </span>
          {ehSupervisor && registro.prioridade ? (
            <label className="oportunidade-page__prioridade">
              <span>Prioridade</span>
              <select
                className="admin-input admin-input--select"
                value={registro.prioridade}
                onChange={mudarPrioridade}
              >
                {PRIORIDADES.map((opcao) => (
                  <option key={opcao.id} value={opcao.id}>{opcao.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          {!ehSupervisor && registro.prioridade ? (
            <span className={`prioridade-badge prioridade-badge--${registro.prioridade}`}>
              Prioridade {prioridadeLabel(registro.prioridade).toLowerCase()}
            </span>
          ) : null}
          <span className="user-cell__meta">
            Atualizada {formatarUltimoAcesso(registro.atualizadaEm).toLowerCase()}
          </span>
        </div>
      </header>

      <div
        className={[
          'oportunidade-abas-trilho',
          bordas.antes ? 'ha-antes' : '',
          bordas.depois ? 'ha-depois' : '',
        ].filter(Boolean).join(' ')}
      >
        {bordas.antes ? (
          <button
            type="button"
            className="oportunidade-abas__rolar oportunidade-abas__rolar--antes"
            aria-label="Ver etapas anteriores"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => rolarEtapas(-1)}
          >
            <Icone icon={appIcons.previous} />
          </button>
        ) : null}

      <nav className="oportunidade-abas" aria-label="Etapas da oportunidade" ref={barraDeEtapas}>
        <ol className="oportunidade-abas__etapas">
          {ETAPAS.map((item) => (
            <li key={item.id}>
              <BotaoAba
                item={item}
                ativa={item.id === abaAtiva}
                bloqueada={abaOcupada && item.id !== abaAtiva}
                onClick={() => trocarAba(item.id)}
                andamento={andamento[item.id]}
              />
            </li>
          ))}
        </ol>

        <ul className="oportunidade-abas__registros" aria-label="Registros">
          {REGISTROS.map((item) => (
            <li key={item.id}>
              <BotaoAba
                item={item}
                ativa={item.id === abaAtiva}
                bloqueada={abaOcupada && item.id !== abaAtiva}
                onClick={() => trocarAba(item.id)}
              />
            </li>
          ))}
        </ul>
      </nav>

        {bordas.depois ? (
          <button
            type="button"
            className="oportunidade-abas__rolar oportunidade-abas__rolar--depois"
            aria-label="Ver mais etapas"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => rolarEtapas(1)}
          >
            <Icone icon={appIcons.next} />
          </button>
        ) : null}
      </div>

      {posicao ? (
        <p className="oportunidade-abas__posicao">
          <span>{posicao.texto}</span>
          {posicao.atual ? (
            <>
              {' '}
              <button
                type="button"
                className="link-button"
                onClick={() => trocarAba(posicao.atual.id)}
                disabled={abaOcupada}
              >
                Ir para a etapa atual
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      {abaOcupada ? (
        <p className="oportunidade-abas__aviso" role="status">
          Aguarde a IA terminar para trocar de etapa.
        </p>
      ) : null}

      <div className="oportunidade-conteudo">
        {abaAtiva === 'contexto' ? (
          <AbaContexto
            oportunidade={registro}
            podeConduzir={ehSupervisor}
            irPara={irPara}
          />
        ) : null}

        {abaAtiva === 'copiloto' ? (
          <AbaCopiloto
            oportunidadeId={id}
            situacao={registro.situacao}
            aoEstruturar={atualizarEmSegundoPlano}
            aoOcupar={setAbaOcupada}
            aoAlterar={alterouRespostas}
            irPara={irPara}
          />
        ) : null}

        {abaAtiva === 'proposta' ? (
          <AbaProposta
            oportunidadeId={id}
            situacao={registro.situacao}
            irPara={irPara}
            aoAlterar={alterouProposta}
            campoEmFoco={campoEmFoco}
            aoFocarCampo={focouCampo}
          />
        ) : null}

        {abaAtiva === 'competencias' ? (
          <AbaCompetencias
            oportunidadeId={id}
            situacao={registro.situacao}
            aoOcupar={setAbaOcupada}
            irPara={irPara}
          />
        ) : null}

        {abaAtiva === 'equipe' ? (
          <AbaEquipe
            oportunidadeId={id}
            situacao={registro.situacao}
            rodadaEmCurso={matchingEmCurso}
            aoRodar={rodarMatching}
            irPara={irPara}
          />
        ) : null}

        {abaAtiva === 'pre-analise' ? (
          <AbaPreAnalise
            oportunidadeId={id}
            situacao={registro.situacao}
            aoOcupar={setAbaOcupada}
            irPara={irPara}
          />
        ) : null}

        {abaAtiva === 'decisao' ? (
          <AbaDecisao
            oportunidadeId={id}
            decisao={decisao}
            situacao={registro.situacao}
            podeDecidir={ehSupervisor}
            onRegistrar={registrarDecisao}
            irPara={irPara}
            observacoes={eventos.filter((evento) => evento.categoria === 'observacao')}
            aoRegistrarObservacao={acrescentarNaTrilha}
          />
        ) : null}

        {abaAtiva === 'anexos' ? (
          <AnexosOportunidade
            codigo={id}
            podeEnviar={ehSupervisor}
            quemVe={
              registro.origem === 'externo'
                ? 'o Supervisor e a equipe indicada. A empresa demandante vê só os documentos que ela mesma enviou.'
                : 'o Supervisor e a equipe indicada.'
            }
          />
        ) : null}

        {abaAtiva === 'historico' ? (
          <AbaHistorico
            codigo={id}
            historico={eventos}
            podeSolicitarComplemento={ehSupervisor && registro.origem === 'externo'}
            aoRegistrar={acrescentarNaTrilha}
          />
        ) : null}
      </div>

      <AdminToast toast={toast} />
    </div>
  )
}
