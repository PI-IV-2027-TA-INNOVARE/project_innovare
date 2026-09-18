import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
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
import AbaContexto from './abas/AbaContexto'
import AbaDecisao from './abas/AbaDecisao'
import AbaHistorico from './abas/AbaHistorico'
import AbaPlanejada from './abas/AbaPlanejada'
import { daApi, eventoDaApi, origemLabel, situacaoLabel } from './oportunidadesData'
import './OportunidadesPage.scss'

const ABAS = [
  { id: 'contexto', label: 'Contexto', icon: appIcons.folder },
  { id: 'proposta', label: 'Proposta estruturada', icon: appIcons.edit, planejada: true },
  { id: 'competencias', label: 'Competências', icon: appIcons.role, planejada: true },
  { id: 'equipe', label: 'Equipe potencial', icon: appIcons.users, planejada: true },
  { id: 'pre-analise', label: 'Pré-análise', icon: appIcons.researcher, planejada: true },
  { id: 'decisao', label: 'Decisão', icon: appIcons.decision },
  { id: 'historico', label: 'Histórico', icon: appIcons.history },
]

const DETALHE_PLANEJADO = {
  proposta: {
    titulo: 'Proposta estruturada',
    texto:
      'Problema de pesquisa, hipótese, objetivos, metodologia, resultados esperados, inovação, infraestrutura e recursos — trabalhados com o Copiloto e revisados por humano.',
  },
  competencias: {
    titulo: 'Competências necessárias',
    texto:
      'Conhecimento científico e técnico exigido pela oportunidade, derivado da proposta estruturada e ajustável pelo Supervisor.',
  },
  equipe: {
    titulo: 'Equipe potencial',
    texto:
      'Sugestões da rede interna com justificativa visível e lacunas de competência. Sugestão, nunca convocação — não há aceite nem recusa.',
  },
  'pre-analise': {
    titulo: 'Pré-análise PIPE/FAPESP',
    texto:
      'Análise orientativa por dimensão, com lacunas e recomendações. Não é nota, parecer, aprovação nem decisão da FAPESP.',
  },
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

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErroCarga('')

    try {
      const dados = await obterOportunidade(id)
      const trilha = await listarHistorico(id).catch(() => [])

      setRegistro(daApi(dados))
      setEventos((trilha.results || trilha).map(eventoDaApi))
    } catch (falha) {
      setRegistro(null)
      setErroCarga(falha?.message || 'Não foi possível carregar esta oportunidade.')
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  const registrarDecisao = async (tipo, justificativa) => {
    try {
      await registrarDecisaoNaApi(id, { tipo, justificativa })
      showToast('Decisão registrada no histórico.')
      await carregar()
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
        <button type="button" className="admin-btn admin-btn--outline" onClick={carregar}>
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
        <BackLink to="/oportunidades">Voltar para oportunidades</BackLink>

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
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`oportunidade-aba${item.id === abaAtiva ? ' is-active' : ''}${item.planejada ? ' is-planned' : ''}`}
            aria-current={item.id === abaAtiva ? 'page' : undefined}
            onClick={() => setAbaAtiva(item.id)}
          >
            <Icone icon={item.icon} className="oportunidade-aba__icon" />
            {item.label}
            {item.planejada ? <span className="oportunidade-aba__tag">Planejado</span> : null}
          </button>
        ))}
      </nav>

      <div className="oportunidade-conteudo">
        {abaAtiva === 'contexto' ? <AbaContexto oportunidade={registro} /> : null}

        {abaAtiva === 'decisao' ? (
          <AbaDecisao
            decisao={decisao}
            podeDecidir={ehSupervisor}
            onRegistrar={registrarDecisao}
          />
        ) : null}

        {abaAtiva === 'historico' ? <AbaHistorico historico={eventos} /> : null}

        {aba.planejada ? (
          <AbaPlanejada
            titulo={DETALHE_PLANEJADO[aba.id].titulo}
            texto={DETALHE_PLANEJADO[aba.id].texto}
          />
        ) : null}
      </div>

      <AdminToast toast={toast} />
    </div>
  )
}
