import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  SkeletonRows,
  SortableHeader,
  TableEmpty,
} from '../../../components/console/ConsoleTable'
import { useAuth } from '../../../context/AuthContext'
import { Icone, appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { listOportunidades } from '../../../services/pdConnectApi'
import { SITUACOES, daApi, situacaoLabel } from '../oportunidades/oportunidadesData'
import { precisaComplementacao, resumoDoDemandante } from './problemasData'
import './ProblemasPage.scss'

const COLUNAS = [
  { id: 'titulo', label: 'Problema', ordenavel: true },
  { id: 'situacao', label: 'Situação', ordenavel: true },
  { id: 'criadaEm', label: 'Cadastrado', ordenavel: true },
  { id: 'atualizadaEm', label: 'Atualizado', ordenavel: true },
]

function comparar(a, b, campo) {
  if (campo === 'criadaEm' || campo === 'atualizadaEm') return a[campo] - b[campo]

  if (campo === 'situacao') {
    const etapa = (id) => SITUACOES.find((item) => item.id === id)?.etapa || 0
    return etapa(a.situacao) - etapa(b.situacao)
  }

  return String(a[campo]).localeCompare(String(b[campo]), 'pt-BR', { sensitivity: 'base' })
}

export default function ProblemasPage() {
  const { user } = useAuth()

  const [meus, setMeus] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [parametros, setParametros] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [situacaoFiltro, setSituacaoFiltro] = useState(
    () => parametros.get('situacao') || 'todas'
  )
  const [ordem, setOrdem] = useState({ campo: 'atualizadaEm', direcao: 'desc' })

  const trocarSituacao = (valor) => {
    setSituacaoFiltro(valor)
    setParametros(valor === 'todas' ? {} : { situacao: valor }, { replace: true })
  }

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErroCarga('')

    try {
      const resposta = await listOportunidades()
      setMeus((resposta.results || resposta).map(daApi))
    } catch (problema) {
      setMeus([])
      setErroCarga(problema?.message || 'Não foi possível carregar os seus problemas.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const indicadores = useMemo(() => resumoDoDemandante(meus), [meus])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return meus.filter((item) => {
      const situacaoOk = situacaoFiltro === 'todas' || item.situacao === situacaoFiltro
      const buscaOk =
        !termo ||
        item.titulo.toLowerCase().includes(termo) ||
        item.id.toLowerCase().includes(termo)

      return situacaoOk && buscaOk
    })
  }, [busca, meus, situacaoFiltro])

  const ordenados = useMemo(() => {
    const fator = ordem.direcao === 'asc' ? 1 : -1
    return [...filtrados].sort((a, b) => comparar(a, b, ordem.campo) * fator)
  }, [filtrados, ordem])

  const temFiltro = Boolean(busca) || situacaoFiltro !== 'todas'

  const ordenarPor = (campo) => {
    setOrdem((atual) => ({
      campo,
      direcao: atual.campo === campo && atual.direcao === 'asc' ? 'desc' : 'asc',
    }))
  }

  const limparFiltros = () => {
    setBusca('')
    trocarSituacao('todas')
  }

  return (
    <div className="console problemas-page">
      <header className="problemas-page__header">
        <div>
          <p className="admin-page__breadcrumb">
            {user?.displayName || 'Sua organização'}{' '}
            <span aria-hidden="true">·</span> P&amp;D Connect
          </p>
          <h1 className="problemas-page__title">Meus problemas</h1>
          <p className="problemas-page__description">
            Os desafios que a sua organização trouxe para a AC2. Você cadastra e
            acompanha os seus; a condução técnica é do Núcleo de P&amp;D.
          </p>
        </div>

        <Link className="admin-btn" to="/problemas/novo">
          <Icone icon={appIcons.addUser} />
          Cadastrar problema
        </Link>
      </header>

      {erroCarga ? (
        <div className="admin-callout" role="alert">
          <Icone icon={appIcons.warning} className="admin-callout__icon" />
          <p className="admin-callout__text">{erroCarga}</p>
          <button type="button" className="link-button" onClick={carregar}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      <div className="stat-grid">
        <article className="stat-card">
          <Icone icon={appIcons.folder} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Problemas cadastrados</p>
            <p className="stat-card__value">{indicadores.total}</p>
          </div>
        </article>

        <article className="stat-card stat-card--ok">
          <Icone icon={appIcons.flow} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Em análise pela AC2</p>
            <p className="stat-card__value">{indicadores.emAnalise}</p>
          </div>
        </article>

        <article
          className={`stat-card${indicadores.aguardandoVoce > 0 ? ' stat-card--alert' : ''}`}
        >
          <Icone icon={appIcons.warning} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Aguardando você</p>
            <p className="stat-card__value">{indicadores.aguardandoVoce}</p>
          </div>
        </article>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search">
          <Icone icon={appIcons.search} className="admin-search__icon" />
          <input
            type="search"
            className="admin-search__input"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar por título ou código..."
            aria-label="Buscar problemas"
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

        <div className="admin-toolbar__actions">
          <label className="sr-only" htmlFor="filtro-situacao-problema">
            Filtrar por situação
          </label>
          <select
            id="filtro-situacao-problema"
            className="admin-input admin-input--select"
            value={situacaoFiltro}
            onChange={(event) => trocarSituacao(event.target.value)}
          >
            <option value="todas">Todas as situações</option>
            {SITUACOES.map((situacao) => (
              <option key={situacao.id} value={situacao.id}>{situacao.label}</option>
            ))}
          </select>
        </div>
      </div>

      {temFiltro ? (
        <div className="active-filters">
          <span className="rede-page__count">{ordenados.length} de {meus.length}</span>
          <button type="button" className="link-button" onClick={limparFiltros}>
            Limpar filtros
          </button>
        </div>
      ) : null}

      <div className="admin-table-wrap">
        <table className="admin-table admin-table--users">
          <caption className="sr-only">Problemas cadastrados pela sua organização</caption>
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

            {!carregando && ordenados.map((item) => (
              <tr key={item.id}>
                <td data-label="Problema">
                  <Link className="oportunidade-link" to={`/problemas/${item.id}`}>
                    <span className="oportunidade-link__titulo">{item.titulo}</span>
                    <span className="oportunidade-link__meta">{item.id}</span>
                  </Link>
                </td>

                <td data-label="Situação">
                  <span className={`fluxo-badge fluxo-badge--${item.situacao}`}>
                    {situacaoLabel(item.situacao)}
                  </span>
                  {precisaComplementacao(item) ? (
                    <span className="problema-pendencia">
                      <Icone icon={appIcons.warning} aria-hidden="true" />
                      Complementação pedida
                    </span>
                  ) : null}
                </td>

                <td data-label="Cadastrado">
                  <span className="user-cell__meta">{formatarUltimoAcesso(item.criadaEm)}</span>
                </td>

                <td data-label="Atualizado">
                  <span className="user-cell__meta">{formatarUltimoAcesso(item.atualizadaEm)}</span>
                </td>
              </tr>
            ))}

            {!carregando && ordenados.length === 0 ? (
              <tr>
                <td colSpan={COLUNAS.length}>
                  <TableEmpty
                    icon={appIcons.folder}
                    title="Nenhum problema encontrado."
                    text={
                      temFiltro
                        ? 'Nenhum corresponde aos filtros aplicados.'
                        : 'Cadastre o primeiro desafio que a sua organização quer levar à AC2.'
                    }
                    action={
                      temFiltro ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn--outline"
                          onClick={limparFiltros}
                        >
                          Limpar filtros
                        </button>
                      ) : (
                        <Link className="admin-btn" to="/problemas/novo">
                          Cadastrar problema
                        </Link>
                      )
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
