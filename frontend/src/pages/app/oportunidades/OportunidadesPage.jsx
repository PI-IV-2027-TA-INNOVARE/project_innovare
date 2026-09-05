import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  SkeletonRows,
  SortableHeader,
  TableEmpty,
} from '../../../components/console/ConsoleTable'
import { useAuth } from '../../../context/AuthContext'
import { appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { ROLES } from '../../../lib/roles'
import {
  ORIGENS,
  OPORTUNIDADES_EXEMPLO,
  SITUACOES,
  disponibilizadasPara,
  origemLabel,
  resumoPorSituacao,
  situacaoLabel,
} from './oportunidadesData'
import './OportunidadesPage.scss'

/**
 * Oportunidades (RF14).
 *
 * Uma tela, dois públicos, e a diferença não é cosmética:
 *
 * - **Supervisor** vê a fila inteira e conduz — é dele a decisão (RN-A07).
 * - **Pesquisador** vê apenas as oportunidades em que integra a equipe potencial
 *   (D02), em acompanhamento. Não há catálogo para navegar, nem botão de aceitar
 *   ou recusar: o matching sugere, o Supervisor valida (RN-A06 / D07).
 *
 * Placeholder local; os endpoints são da Fase 3.1.
 */

const COLUNAS = [
  { id: 'titulo', label: 'Oportunidade', ordenavel: true },
  { id: 'origem', label: 'Origem', ordenavel: true },
  { id: 'situacao', label: 'Situação', ordenavel: true },
  { id: 'equipe', label: 'Equipe potencial', ordenavel: false },
  { id: 'atualizadaEm', label: 'Atualizada', ordenavel: true },
]

function comparar(a, b, campo) {
  if (campo === 'atualizadaEm') return a.atualizadaEm - b.atualizadaEm

  if (campo === 'situacao') {
    const etapa = (id) => SITUACOES.find((item) => item.id === id)?.etapa || 0
    return etapa(a.situacao) - etapa(b.situacao)
  }

  if (campo === 'origem') return origemLabel(a.origem).localeCompare(origemLabel(b.origem), 'pt-BR')

  return String(a[campo]).localeCompare(String(b[campo]), 'pt-BR', { sensitivity: 'base' })
}

export default function OportunidadesPage() {
  const { user } = useAuth()

  // Papel explícito, e não "tudo que não for Supervisor é Pesquisador": tratar a
  // ausência de um papel como a presença de outro fazia o Administrador cair na
  // tela do Pesquisador e ler que seria "indicado para uma equipe potencial" —
  // coisa que a baseline não prevê para ele (CONTEXT.md §3).
  const ehSupervisor = user?.role === ROLES.SUPERVISOR
  const ehPesquisador = user?.role === ROLES.PESQUISADOR

  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [situacaoFiltro, setSituacaoFiltro] = useState('todas')
  const [origemFiltro, setOrigemFiltro] = useState('todas')
  const [ordem, setOrdem] = useState({ campo: 'atualizadaEm', direcao: 'desc' })

  useEffect(() => {
    const timer = setTimeout(() => setCarregando(false), 400)
    return () => clearTimeout(timer)
  }, [])

  // O escopo é resolvido aqui, não pelo filtro: o Pesquisador não deve nem
  // conseguir pedir a lista completa.
  const escopo = useMemo(() => {
    if (ehSupervisor) return OPORTUNIDADES_EXEMPLO
    if (ehPesquisador) return disponibilizadasPara(user?.displayName || '')

    // Defesa em profundidade: a rota já barra os outros papéis, mas uma tela que
    // devolve lista vazia é melhor que uma que devolve a lista de outra pessoa.
    return []
  }, [ehPesquisador, ehSupervisor, user?.displayName])

  const indicadores = useMemo(() => resumoPorSituacao(escopo), [escopo])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return escopo.filter((item) => {
      const situacaoOk = situacaoFiltro === 'todas' || item.situacao === situacaoFiltro
      const origemOk = origemFiltro === 'todas' || item.origem === origemFiltro
      const buscaOk =
        !termo ||
        item.titulo.toLowerCase().includes(termo) ||
        item.id.toLowerCase().includes(termo) ||
        item.demandante.toLowerCase().includes(termo)

      return situacaoOk && origemOk && buscaOk
    })
  }, [busca, escopo, origemFiltro, situacaoFiltro])

  const ordenadas = useMemo(() => {
    const fator = ordem.direcao === 'asc' ? 1 : -1
    return [...filtradas].sort((a, b) => comparar(a, b, ordem.campo) * fator)
  }, [filtradas, ordem])

  const temFiltro = Boolean(busca) || situacaoFiltro !== 'todas' || origemFiltro !== 'todas'

  const ordenarPor = (campo) => {
    setOrdem((atual) => ({
      campo,
      direcao: atual.campo === campo && atual.direcao === 'asc' ? 'desc' : 'asc',
    }))
  }

  const limparFiltros = () => {
    setBusca('')
    setSituacaoFiltro('todas')
    setOrigemFiltro('todas')
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

        {/*
          A tela de cadastro de ideia interna (RN-A03 / D05) ainda não existe —
          é a próxima da fila em §6.7. O botão fica visível e desabilitado, como
          os itens "em breve" do menu da conta: apontar para uma rota inexistente
          levava a pessoa a um "código não encontrado" e parecia defeito.
        */}
        {ehSupervisor ? (
          <button
            type="button"
            className="admin-btn"
            disabled
            title="Cadastro de ideia interna — em breve"
          >
            <FontAwesomeIcon icon={appIcons.addUser} />
            Nova ideia interna
            <span className="admin-btn__soon">em breve</span>
          </button>
        ) : null}
      </header>

      <div className="admin-callout" role="note">
        <FontAwesomeIcon icon={appIcons.info} className="admin-callout__icon" />
        <p className="admin-callout__text">
          Interface preliminar — os registros são um exemplo local. O módulo de
          Oportunidade entra na Fase 3.1 do plano.
        </p>
      </div>

      {ehSupervisor ? (
        <div className="stat-grid">
          <article className="stat-card">
            <FontAwesomeIcon icon={appIcons.folder} className="stat-card__icon" />
            <div>
              <p className="stat-card__label">Oportunidades</p>
              <p className="stat-card__value">{indicadores.total}</p>
            </div>
          </article>

          <article className="stat-card stat-card--ok">
            <FontAwesomeIcon icon={appIcons.flow} className="stat-card__icon" />
            <div>
              <p className="stat-card__label">Em andamento</p>
              <p className="stat-card__value">{indicadores.emAndamento}</p>
            </div>
          </article>

          <article className="stat-card">
            <FontAwesomeIcon icon={appIcons.decision} className="stat-card__icon" />
            <div>
              <p className="stat-card__label">Aguardando sua decisão</p>
              <p className="stat-card__value">{indicadores.aguardandoDecisao}</p>
            </div>
          </article>

          <article className="stat-card stat-card--alert">
            <FontAwesomeIcon icon={appIcons.warning} className="stat-card__icon" />
            <div>
              <p className="stat-card__label">Com lacuna de competência</p>
              <p className="stat-card__value">{indicadores.comLacuna}</p>
            </div>
          </article>
        </div>
      ) : null}

      <div className="admin-toolbar">
        <div className="admin-search">
          <FontAwesomeIcon icon={appIcons.search} className="admin-search__icon" />
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
              <FontAwesomeIcon icon={appIcons.clear} />
            </button>
          ) : null}
        </div>

        <div className="admin-toolbar__actions">
          <label className="sr-only" htmlFor="filtro-situacao">Filtrar por situação</label>
          <select
            id="filtro-situacao"
            className="admin-input admin-input--select"
            value={situacaoFiltro}
            onChange={(event) => setSituacaoFiltro(event.target.value)}
          >
            <option value="todas">Todas as situações</option>
            {SITUACOES.map((situacao) => (
              <option key={situacao.id} value={situacao.id}>{situacao.label}</option>
            ))}
          </select>

          <label className="sr-only" htmlFor="filtro-origem">Filtrar por origem</label>
          <select
            id="filtro-origem"
            className="admin-input admin-input--select"
            value={origemFiltro}
            onChange={(event) => setOrigemFiltro(event.target.value)}
          >
            <option value="todas">Todas as origens</option>
            {ORIGENS.map((origem) => (
              <option key={origem.id} value={origem.id}>{origem.label}</option>
            ))}
          </select>
        </div>
      </div>

      {temFiltro ? (
        <div className="active-filters">
          <span className="rede-page__count">{ordenadas.length} de {escopo.length}</span>
          <button type="button" className="link-button" onClick={limparFiltros}>
            Limpar filtros
          </button>
        </div>
      ) : null}

      <div className="admin-table-wrap">
        <table className="admin-table admin-table--users">
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

                <td data-label="Equipe potencial">
                  {item.equipe.length > 0 ? (
                    <span className="user-cell__meta">
                      {item.equipe.length} {item.equipe.length === 1 ? 'pessoa' : 'pessoas'}
                      {item.lacunas.length > 0 ? (
                        <span className="oportunidade-lacuna" title={item.lacunas.join(' · ')}>
                          <FontAwesomeIcon icon={appIcons.warning} aria-hidden="true" />
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
