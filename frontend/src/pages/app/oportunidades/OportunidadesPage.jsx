import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  SkeletonRows,
  SortableHeader,
  TableEmpty,
} from '../../../components/console/ConsoleTable'
import { useAuth } from '../../../context/AuthContext'
import { useAtualizarAoFocar } from '../../../lib/atualizarAoFocar'
import { Icone, appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { ROLES } from '../../../lib/roles'
import { listOportunidades } from '../../../services/pdConnectApi'
import {
  ORIGENS,
  PRIORIDADES,
  SITUACOES,
  daApi,
  origemLabel,
  prioridadeLabel,
  resumoPorSituacao,
  situacaoLabel,
} from './oportunidadesData'
import './OportunidadesPage.scss'

const COLUNAS = [
  { id: 'titulo', label: 'Oportunidade', ordenavel: true },
  { id: 'origem', label: 'Origem', ordenavel: true },
  { id: 'situacao', label: 'Situação', ordenavel: true },
  { id: 'prioridade', label: 'Prioridade', ordenavel: true },
  { id: 'equipe', label: 'Equipe potencial', ordenavel: false },
  { id: 'atualizadaEm', label: 'Atualizada', ordenavel: true },
]

function diaLocal(instante) {
  const data = new Date(instante)
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${mes}-${dia}`
}

const ordemDaPrioridade = (id) =>
  PRIORIDADES.find((item) => item.id === id)?.ordem ?? PRIORIDADES.length

function comparar(a, b, campo) {
  if (campo === 'atualizadaEm') return a.atualizadaEm - b.atualizadaEm

  if (campo === 'prioridade') {
    return (
      ordemDaPrioridade(a.prioridade) - ordemDaPrioridade(b.prioridade) ||
      b.atualizadaEm - a.atualizadaEm
    )
  }

  if (campo === 'situacao') {
    const etapa = (id) => SITUACOES.find((item) => item.id === id)?.etapa || 0
    return etapa(a.situacao) - etapa(b.situacao)
  }

  if (campo === 'origem') return origemLabel(a.origem).localeCompare(origemLabel(b.origem), 'pt-BR')

  return String(a[campo]).localeCompare(String(b[campo]), 'pt-BR', { sensitivity: 'base' })
}

export default function OportunidadesPage() {
  const { user } = useAuth()

  const ehSupervisor = user?.role === ROLES.SUPERVISOR
  const ehPesquisador = user?.role === ROLES.PESQUISADOR

  const [parametros, setParametros] = useSearchParams()

  const [oportunidades, setOportunidades] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [busca, setBusca] = useState('')
  const [situacaoFiltro, setSituacaoFiltro] = useState(
    () => parametros.get('situacao') || 'todas'
  )
  const [origemFiltro, setOrigemFiltro] = useState('todas')
  const [prioridadeFiltro, setPrioridadeFiltro] = useState('todas')
  const [cadastradaDe, setCadastradaDe] = useState('')
  const [cadastradaAte, setCadastradaAte] = useState('')
  const [soMinhaAtuacao, setSoMinhaAtuacao] = useState(false)
  const [ordem, setOrdem] = useState({ campo: 'prioridade', direcao: 'asc' })

  const acompanhaFila = ehSupervisor || ehPesquisador

  const carregar = useCallback(async () => {
    if (!acompanhaFila) {
      setOportunidades([])
      setCarregando(false)
      return
    }

    setCarregando(true)
    setErroCarga('')

    try {
      const resposta = await listOportunidades({ ordenar: 'prioridade' })
      setOportunidades((resposta.results || resposta).map(daApi))
    } catch (erro) {
      setOportunidades([])
      setErroCarga(erro.message || 'Não foi possível carregar as oportunidades.')
    } finally {
      setCarregando(false)
    }
  }, [acompanhaFila])

  useEffect(() => {
    carregar()
  }, [carregar])

  useAtualizarAoFocar(carregar, { ativo: acompanhaFila })

  const indicadores = useMemo(() => resumoPorSituacao(oportunidades), [oportunidades])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return oportunidades.filter((item) => {
      const situacaoOk = situacaoFiltro === 'todas' || item.situacao === situacaoFiltro
      const origemOk = origemFiltro === 'todas' || item.origem === origemFiltro
      const prioridadeOk = prioridadeFiltro === 'todas' || item.prioridade === prioridadeFiltro
      const buscaOk =
        !termo ||
        item.titulo.toLowerCase().includes(termo) ||
        item.id.toLowerCase().includes(termo) ||
        item.demandante.toLowerCase().includes(termo)
      const dia = diaLocal(item.criadaEm)
      const dataOk =
        (!cadastradaDe || dia >= cadastradaDe) && (!cadastradaAte || dia <= cadastradaAte)

      const atuacaoOk = !soMinhaAtuacao || item.aguardaMinhaAtuacao

      return situacaoOk && origemOk && prioridadeOk && buscaOk && dataOk && atuacaoOk
    })
  }, [
    busca,
    cadastradaAte,
    cadastradaDe,
    oportunidades,
    origemFiltro,
    prioridadeFiltro,
    situacaoFiltro,
    soMinhaAtuacao,
  ])

  const aguardandoMinhaAtuacao = useMemo(
    () => oportunidades.filter((item) => item.aguardaMinhaAtuacao).length,
    [oportunidades]
  )

  const ordenadas = useMemo(() => {
    const fator = ordem.direcao === 'asc' ? 1 : -1
    return [...filtradas].sort((a, b) => comparar(a, b, ordem.campo) * fator)
  }, [filtradas, ordem])

  const temFiltro =
    Boolean(busca) ||
    situacaoFiltro !== 'todas' ||
    origemFiltro !== 'todas' ||
    prioridadeFiltro !== 'todas' ||
    Boolean(cadastradaDe) ||
    Boolean(cadastradaAte) ||
    soMinhaAtuacao

  const ordenarPor = (campo) => {
    setOrdem((atual) => ({
      campo,
      direcao: atual.campo === campo && atual.direcao === 'asc' ? 'desc' : 'asc',
    }))
  }

  const trocarSituacao = (valor) => {
    setSituacaoFiltro(valor)
    setParametros(valor === 'todas' ? {} : { situacao: valor }, { replace: true })
  }

  const limparFiltros = () => {
    setBusca('')
    trocarSituacao('todas')
    setOrigemFiltro('todas')
    setPrioridadeFiltro('todas')
    setCadastradaDe('')
    setCadastradaAte('')
    setSoMinhaAtuacao(false)
  }

  return (
    <div className="console oportunidades-page">
      <header className="oportunidades-page__header">
        <div>
          <p className="admin-page__breadcrumb">
            AC2 Microbiologia <span aria-hidden="true">·</span> Núcleo de P&amp;D
          </p>
          <h1 className="oportunidades-page__title">
            {ehSupervisor ? 'Oportunidades' : 'Minhas oportunidades'}
          </h1>
          <p className="oportunidades-page__description">
            {ehSupervisor
              ? 'Da entrada da oportunidade até a decisão. Você conduz o fluxo e registra o encaminhamento.'
              : 'Oportunidades em que você integra a equipe potencial. O acompanhamento é seu; a decisão é do Supervisor.'}
          </p>
        </div>

        {ehSupervisor ? (
          <Link className="admin-btn" to="/oportunidades/nova">
            <Icone icon={appIcons.addUser} />
            Nova ideia interna
          </Link>
        ) : null}
      </header>

      {erroCarga ? (
        <div className="admin-callout" role="alert">
          <Icone icon={appIcons.info} className="admin-callout__icon" />
          <p className="admin-callout__text">{erroCarga}</p>
          <button type="button" className="link-button" onClick={carregar}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      {ehSupervisor ? (
        <div className="stat-grid">
          <article className="stat-card">
            <Icone icon={appIcons.folder} className="stat-card__icon" />
            <div>
              <p className="stat-card__label">Oportunidades</p>
              <p className="stat-card__value">{indicadores.total}</p>
            </div>
          </article>

          <article className="stat-card stat-card--ok">
            <Icone icon={appIcons.flow} className="stat-card__icon" />
            <div>
              <p className="stat-card__label">Em andamento</p>
              <p className="stat-card__value">{indicadores.emAndamento}</p>
            </div>
          </article>

          <article className="stat-card">
            <Icone icon={appIcons.decision} className="stat-card__icon" />
            <div>
              <p className="stat-card__label">Aguardando sua decisão</p>
              <p className="stat-card__value">{indicadores.aguardandoDecisao}</p>
            </div>
          </article>

          <article className="stat-card stat-card--alert">
            <Icone icon={appIcons.warning} className="stat-card__icon" />
            <div>
              <p className="stat-card__label">Com lacuna de competência</p>
              <p className="stat-card__value">{indicadores.comLacuna}</p>
            </div>
          </article>
        </div>
      ) : null}

      <section className="filtros-oportunidades" aria-label="Filtros da fila">
        <div className="filtros-oportunidades__principal">
          <div className="admin-search">
            <Icone icon={appIcons.search} className="admin-search__icon" />
            <input
              type="search"
              className="admin-search__input"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar por título, código ou demandante..."
              aria-label="Buscar oportunidades"
            />
            {busca ? (
              <button
                type="button"
                className="admin-search__clear"
                onClick={() => setBusca('')}
                title="Limpar pesquisa"
                aria-label="Limpar pesquisa"
              >
                <Icone icon={appIcons.clear} />
              </button>
            ) : null}
          </div>

          {ehSupervisor ? (
            <button
              type="button"
              className={`admin-btn admin-btn--outline${soMinhaAtuacao ? ' is-active' : ''}`}
              aria-pressed={soMinhaAtuacao}
              title="Sem responsável ou conduzidas por você, em Entrada, aguardando decisão ou com resposta do Demandante a um pedido de revisão."
              onClick={() => setSoMinhaAtuacao((atual) => !atual)}
            >
              Aguardando minha atuação ({aguardandoMinhaAtuacao})
            </button>
          ) : null}
        </div>

        <div className="filtros-oportunidades__refino">
          <label className="admin-field">
            <span className="admin-field__label">Situação</span>
            <select
              className="admin-input admin-input--select"
              value={situacaoFiltro}
              onChange={(event) => trocarSituacao(event.target.value)}
            >
              <option value="todas">Todas as situações</option>
              {SITUACOES.map((situacao) => (
                <option key={situacao.id} value={situacao.id}>{situacao.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span className="admin-field__label">Origem</span>
            <select
              className="admin-input admin-input--select"
              value={origemFiltro}
              onChange={(event) => setOrigemFiltro(event.target.value)}
            >
              <option value="todas">Todas as origens</option>
              {ORIGENS.map((origem) => (
                <option key={origem.id} value={origem.id}>{origem.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span className="admin-field__label">Prioridade</span>
            <select
              className="admin-input admin-input--select"
              value={prioridadeFiltro}
              onChange={(event) => setPrioridadeFiltro(event.target.value)}
            >
              <option value="todas">Todas as prioridades</option>
              {PRIORIDADES.map((prioridade) => (
                <option key={prioridade.id} value={prioridade.id}>{prioridade.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span className="admin-field__label">Cadastrada a partir de</span>
            <input
              type="date"
              className="admin-input"
              value={cadastradaDe}
              max={cadastradaAte || undefined}
              onChange={(event) => setCadastradaDe(event.target.value)}
            />
          </label>

          <label className="admin-field">
            <span className="admin-field__label">Cadastrada até</span>
            <input
              type="date"
              className="admin-input"
              value={cadastradaAte}
              min={cadastradaDe || undefined}
              onChange={(event) => setCadastradaAte(event.target.value)}
            />
          </label>
        </div>
      </section>

      {temFiltro ? (
        <div className="active-filters">
          <span className="rede-page__count">{ordenadas.length} de {oportunidades.length}</span>
          <button type="button" className="link-button" onClick={limparFiltros}>
            Limpar filtros
          </button>
        </div>
      ) : null}

      <div className="admin-table-wrap">
        <table className="admin-table admin-table--users">
          <caption className="sr-only">Fila de oportunidades</caption>
          <thead>
            <tr>
              {COLUNAS.map((coluna) => (
                <th
                  key={coluna.id}
                  scope="col"
                  aria-sort={
                    ordem.campo === coluna.id
                      ? (ordem.direcao === 'asc' ? 'ascending' : 'descending')
                      : undefined
                  }
                >
                  {coluna.ordenavel ? (
                    <SortableHeader coluna={coluna} ordem={ordem} onSort={ordenarPor} />
                  ) : (
                    coluna.label
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {carregando ? <SkeletonRows colunas={COLUNAS.length} /> : null}

            {!carregando && ordenadas.map((item) => (
              <tr key={item.id}>
                <td data-label="Oportunidade">
                  <Link className="oportunidade-link" to={`/oportunidades/${item.id}`}>
                    <span className="oportunidade-link__titulo">{item.titulo}</span>
                    <span className="oportunidade-link__meta">
                      {item.id} · {item.demandante}
                    </span>
                  </Link>
                </td>

                <td data-label="Origem">
                  <span className={`origem-badge origem-badge--${item.origem}`}>
                    {origemLabel(item.origem)}
                  </span>
                </td>

                <td data-label="Situação">
                  <span className={`fluxo-badge fluxo-badge--${item.situacao}`}>
                    {situacaoLabel(item.situacao)}
                  </span>
                </td>

                <td data-label="Prioridade">
                  {item.prioridade ? (
                    <span className={`prioridade-badge prioridade-badge--${item.prioridade}`}>
                      {prioridadeLabel(item.prioridade)}
                    </span>
                  ) : null}
                </td>

                <td data-label="Equipe potencial">
                  {item.equipe.length > 0 ? (
                    <span className="user-cell__meta">
                      {item.equipe.length} {item.equipe.length === 1 ? 'pessoa' : 'pessoas'}
                      {item.lacunas.length > 0 ? (
                        <span className="oportunidade-lacuna" title={item.lacunas.join(' · ')}>
                          <Icone icon={appIcons.warning} aria-hidden="true" />
                          {item.lacunas.length} lacuna
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="user-cell__meta">Ainda sem matching</span>
                  )}
                </td>

                <td data-label="Atualizada">
                  <span className="user-cell__meta">{formatarUltimoAcesso(item.atualizadaEm)}</span>
                </td>
              </tr>
            ))}

            {!carregando && ordenadas.length === 0 ? (
              <tr>
                <td colSpan={COLUNAS.length}>
                  <TableEmpty
                    icon={appIcons.folder}
                    title="Nenhuma oportunidade encontrada."
                    text={
                      temFiltro
                        ? 'Nenhuma corresponde aos filtros aplicados.'
                        : ehSupervisor
                          ? 'Cadastre uma ideia interna ou aguarde um problema externo.'
                          : ehPesquisador
                            ? 'Quando você for indicado para uma equipe potencial, ela aparece aqui.'
                            : 'Seu perfil não acompanha oportunidades por esta tela.'
                    }
                    action={
                      temFiltro ? (
                        <button type="button" className="admin-btn admin-btn--outline" onClick={limparFiltros}>
                          Limpar filtros
                        </button>
                      ) : null
                    }
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
