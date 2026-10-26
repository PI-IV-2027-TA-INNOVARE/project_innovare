import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BackLink from '../../../components/console/BackLink'
import { AdminToast, useToast } from '../../../components/console/toast'
import { useAuth } from '../../../context/AuthContext'
import { Icone, appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { ROLES } from '../../../lib/roles'
import {
  listarHistorico,
  obterOportunidade,
  registrarDecisao as registrarDecisaoNaApi,
} from '../../../services/pdConnectApi'
import AnexosOportunidade from '../../../components/AnexosOportunidade'
import AbaCompetencias from './abas/AbaCompetencias'
import AbaContexto from './abas/AbaContexto'
import AbaCopiloto from './abas/AbaCopiloto'
import AbaDecisao from './abas/AbaDecisao'
import AbaEquipe from './abas/AbaEquipe'
import AbaHistorico from './abas/AbaHistorico'
import AbaPreAnalise from './abas/AbaPreAnalise'
import AbaProposta from './abas/AbaProposta'
import { ETAPAS, REGISTROS } from './etapas'
import { daApi, eventoDaApi, origemLabel, situacaoLabel } from './oportunidadesData'
import './OportunidadesPage.scss'

const ABAS = [...ETAPAS, ...REGISTROS]

function BotaoAba({ item, ativa, bloqueada, onClick }) {
  return (
    <button
      type="button"
      className={`oportunidade-aba${ativa ? ' is-active' : ''}`}
      aria-current={ativa ? 'step' : undefined}
      disabled={bloqueada}
      onClick={onClick}
    >
      {item.numero ? (
        <span className="oportunidade-aba__numero" aria-hidden="true">
          {item.numero}
        </span>
      ) : (
        <Icone icon={item.icon} className="oportunidade-aba__icon" />
      )}
      {item.label}
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
  const [rascunhoPendente, setRascunhoPendente] = useState(false)

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCarregando(true)
    setErroCarga('')

    try {
      const [dados, trilha] = await Promise.all([
        obterOportunidade(id),
        listarHistorico(id).catch(() => []),
      ])

      setRegistro(daApi(dados))
      setEventos((trilha.results || trilha).map(eventoDaApi))
    } catch (falha) {
      if (!silencioso) setRegistro(null)
      setErroCarga(falha?.message || 'Não foi possível carregar esta oportunidade.')
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  const atualizarEmSegundoPlano = useCallback(
    () => carregar({ silencioso: true }),
    [carregar],
  )

  const trocarAba = useCallback((destino) => {
    if (
      rascunhoPendente &&
      !window.confirm('Há alterações não salvas na proposta. Sair desta etapa sem salvar?')
    ) {
      return
    }

    setRascunhoPendente(false)
    setAbaAtiva(destino)
  }, [rascunhoPendente])

  const irPara = useCallback((destino) => {
    trocarAba(destino)
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }, [trocarAba])

  const registrarDecisao = async (tipo, justificativa) => {
    try {
      await registrarDecisaoNaApi(id, { tipo, justificativa })
      showToast('Decisão registrada no histórico.')
      await atualizarEmSegundoPlano()
    } catch (falha) {
      showToast(falha?.message || 'Não foi possível registrar a decisão.')
    }
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

  if (!registro) {
    return (
      <div className="console oportunidade-page">
        <BackLink to="/oportunidades">Voltar para oportunidades</BackLink>
        <p className="oportunidade-page__vazio">
          Nenhuma oportunidade com o código <code>{id}</code>.
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

        <div className="oportunidade-page__meta">
          <span className="oportunidade-page__codigo">{registro.id}</span>
          <span className={`origem-badge origem-badge--${registro.origem}`}>
            {origemLabel(registro.origem)}
          </span>
          <span className={`fluxo-badge fluxo-badge--${registro.situacao}`}>
            {situacaoLabel(registro.situacao)}
          </span>
          <span className="oportunidade-page__demandante">{registro.demandante}</span>
          <span className="user-cell__meta">
            Atualizada {formatarUltimoAcesso(registro.atualizadaEm).toLowerCase()}
          </span>
        </div>
      </header>

      <nav className="oportunidade-abas" aria-label="Etapas da oportunidade">
        <ol className="oportunidade-abas__etapas">
          {ETAPAS.map((item) => (
            <li key={item.id}>
              <BotaoAba
                item={item}
                ativa={item.id === abaAtiva}
                bloqueada={abaOcupada && item.id !== abaAtiva}
                onClick={() => trocarAba(item.id)}
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
            aoEstruturar={atualizarEmSegundoPlano}
            aoOcupar={setAbaOcupada}
            irPara={irPara}
          />
        ) : null}

        {abaAtiva === 'proposta' ? (
          <AbaProposta
            oportunidadeId={id}
            irPara={irPara}
            aoAlterar={setRascunhoPendente}
          />
        ) : null}

        {abaAtiva === 'competencias' ? (
          <AbaCompetencias oportunidadeId={id} aoOcupar={setAbaOcupada} irPara={irPara} />
        ) : null}

        {abaAtiva === 'equipe' ? (
          <AbaEquipe oportunidadeId={id} aoOcupar={setAbaOcupada} irPara={irPara} />
        ) : null}

        {abaAtiva === 'pre-analise' ? (
          <AbaPreAnalise oportunidadeId={id} aoOcupar={setAbaOcupada} irPara={irPara} />
        ) : null}

        {abaAtiva === 'decisao' ? (
          <AbaDecisao
            decisao={decisao}
            podeDecidir={ehSupervisor}
            onRegistrar={registrarDecisao}
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
            podeRegistrar={ehSupervisor}
            podeSolicitarComplemento={ehSupervisor && registro.origem === 'externo'}
          />
        ) : null}
      </div>

      <AdminToast toast={toast} />
    </div>
  )
}
