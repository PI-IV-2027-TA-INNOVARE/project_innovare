import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import BackLink from '../../../components/console/BackLink'
import { AdminToast, useToast } from '../../../components/console/toast'
import { useAuth } from '../../../context/AuthContext'
import { appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { ROLES } from '../../../lib/roles'
import AbaContexto from './abas/AbaContexto'
import AbaDecisao from './abas/AbaDecisao'
import AbaHistorico from './abas/AbaHistorico'
import AbaPlanejada from './abas/AbaPlanejada'
import {
  OPORTUNIDADES_EXEMPLO,
  disponibilizadasPara,
  origemLabel,
  situacaoLabel,
} from './oportunidadesData'
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

  const registro = useMemo(() => {
    const alcance = ehSupervisor
      ? OPORTUNIDADES_EXEMPLO
      : disponibilizadasPara(user?.displayName || '')

    return alcance.find((item) => item.id === id)
  }, [ehSupervisor, id, user?.displayName])

  const [abaAtiva, setAbaAtiva] = useState('contexto')
  const [decisao, setDecisao] = useState(registro?.decisao || null)

  if (!registro) {
    return (
      <div className="console oportunidade-page">
        <BackLink to="/oportunidades">Voltar para oportunidades</BackLink>
        <p className="oportunidade-page__vazio">
          Nenhuma oportunidade com o código <code>{id}</code>.
        </p>
      </div>
    )
  }

  const registrarDecisao = (tipo, justificativa) => {
    setDecisao({
      tipo,
      justificativa,
      autor: user?.displayName || 'Supervisor',
      em: Date.now(),
    })
    showToast('Decisão registrada no histórico.')
  }

  const aba = ABAS.find((item) => item.id === abaAtiva) || ABAS[0]

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
          <span className={`fluxo-badge fluxo-badge--${decisao ? decisao.tipo : registro.situacao}`}>
            {decisao ? `Decidida: ${situacaoLabel(decisao.tipo)}` : situacaoLabel(registro.situacao)}
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
            <FontAwesomeIcon icon={item.icon} className="oportunidade-aba__icon" />
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

        {abaAtiva === 'historico' ? (
          <AbaHistorico historico={registro.historico} decisao={decisao} />
        ) : null}

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
