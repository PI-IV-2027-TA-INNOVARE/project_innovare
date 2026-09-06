import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import AdminModal from '../../../components/console/AdminModal'
import {
  Avatar,
  RowActionsMenu,
  SkeletonRows,
  SortableHeader,
  TableEmpty,
} from '../../../components/console/ConsoleTable'
import { AdminToast, useToast } from '../../../components/console/toast'
import { appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import {
  PAPEIS_REDE,
  REDE_EXEMPLO,
  SITUACOES,
  TITULACOES,
  disponibilidadeLabel,
  papelLabel,
  situacaoLabel,
  titulacaoLabel,
} from './redeData'
import './RedePage.scss'

/**
 * Rede interna da AC2 (RF02) — tela do Supervisor.
 *
 * É ele quem cadastra pesquisadores e libera o acesso: **não há autocadastro**
 * (RN-A04 / D06). O matching opera somente sobre esta lista (CONTEXT.md §4), o
 * que dá à tela um segundo papel além do cadastral — mostrar onde a rede está
 * cega. Daí a coluna de competências e o indicador de perfis incompletos: um
 * pesquisador sem competência declarada é invisível para o matching.
 *
 * Placeholder local; os endpoints entram na Fase 2 (ver `redeData.js`).
 */

const COLUNAS = [
  { id: 'nome', label: 'Pessoa', ordenavel: true },
  { id: 'papel', label: 'Papel', ordenavel: true },
  { id: 'titulacao', label: 'Titulação', ordenavel: true },
  { id: 'competencias', label: 'Competências', ordenavel: false },
  { id: 'situacao', label: 'Situação', ordenavel: true },
  { id: 'ultimoAcesso', label: 'Último acesso', ordenavel: true },
  { id: 'acoes', label: 'Ações', ordenavel: false },
]

function comparar(a, b, campo) {
  if (campo === 'ultimoAcesso') return (a.ultimoAcesso || 0) - (b.ultimoAcesso || 0)

  if (campo === 'titulacao') {
    const nivel = (id) => TITULACOES.find((item) => item.id === id)?.nivel || 0
    return nivel(a.titulacao) - nivel(b.titulacao)
  }

  if (campo === 'papel') return papelLabel(a.papel).localeCompare(papelLabel(b.papel), 'pt-BR')
  if (campo === 'situacao') return situacaoLabel(a.situacao).localeCompare(situacaoLabel(b.situacao), 'pt-BR')

  return String(a[campo]).localeCompare(String(b[campo]), 'pt-BR', { sensitivity: 'base' })
}

export default function RedePage() {
  const navigate = useNavigate()
  const { toast, showToast } = useToast()

  const [pessoas, setPessoas] = useState(REDE_EXEMPLO)
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [papelFiltro, setPapelFiltro] = useState('todos')
  const [situacaoFiltro, setSituacaoFiltro] = useState('todos')
  const [ordem, setOrdem] = useState({ campo: 'nome', direcao: 'asc' })
  const [detalhe, setDetalhe] = useState(null)

  // Marca o lugar da requisição da Fase 2.
  useEffect(() => {
    const timer = setTimeout(() => setCarregando(false), 400)
    return () => clearTimeout(timer)
  }, [])

  const estatisticas = useMemo(() => ({
    total: pessoas.length,
    ativos: pessoas.filter((pessoa) => pessoa.situacao === 'ativo').length,
    titulados: pessoas.filter((pessoa) => ['mestrado', 'doutorado', 'pos_doutorado'].includes(pessoa.titulacao)).length,
    semCompetencia: pessoas.filter((pessoa) => pessoa.competencias.length === 0).length,
  }), [pessoas])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return pessoas.filter((pessoa) => {
      const papelOk = papelFiltro === 'todos' || pessoa.papel === papelFiltro
      const situacaoOk = situacaoFiltro === 'todos' || pessoa.situacao === situacaoFiltro
      const buscaOk =
        !termo ||
        pessoa.nome.toLowerCase().includes(termo) ||
        pessoa.email.toLowerCase().includes(termo) ||
        pessoa.competencias.some((competencia) => competencia.toLowerCase().includes(termo))

      return papelOk && situacaoOk && buscaOk
    })
  }, [busca, papelFiltro, pessoas, situacaoFiltro])

  const ordenadas = useMemo(() => {
    const fator = ordem.direcao === 'asc' ? 1 : -1
    return [...filtradas].sort((a, b) => comparar(a, b, ordem.campo) * fator)
  }, [filtradas, ordem])

  const temFiltro = Boolean(busca) || papelFiltro !== 'todos' || situacaoFiltro !== 'todos'

  const ordenarPor = (campo) => {
    setOrdem((atual) => ({
      campo,
      direcao: atual.campo === campo && atual.direcao === 'asc' ? 'desc' : 'asc',
    }))
  }

  const limparFiltros = () => {
    setBusca('')
    setPapelFiltro('todos')
    setSituacaoFiltro('todos')
  }

  const liberarAcesso = (pessoa) => {
    setPessoas((atual) =>
      atual.map((item) => (item.id === pessoa.id ? { ...item, situacao: 'ativo' } : item))
    )
    showToast(`Acesso liberado para ${pessoa.nome}.`)
  }

  const inativar = (pessoa) => {
    setPessoas((atual) =>
      atual.map((item) => (item.id === pessoa.id ? { ...item, situacao: 'inativo' } : item))
    )
    showToast(`${pessoa.nome} saiu da rede ativa.`)
  }

  return (
    <div className="console rede-page">
      <header className="rede-page__header">
        <div>
          <p className="admin-page__breadcrumb">
            AC2 Microbiologia <span aria-hidden="true">·</span> Núcleo de P&amp;D
          </p>
          <h1 className="rede-page__title">Rede interna</h1>
          <p className="rede-page__description">
            Pesquisadores, colaboradores e supervisores da AC2. O matching opera
            somente sobre esta rede — quem não está aqui não é sugerido.
          </p>
        </div>

        <Link className="admin-btn" to="/rede/novo">
          <FontAwesomeIcon icon={appIcons.addUser} />
          Cadastrar pesquisador
        </Link>
      </header>

      <div className="admin-callout" role="note">
        <FontAwesomeIcon icon={appIcons.info} className="admin-callout__icon" />
        <p className="admin-callout__text">
          Interface preliminar — os registros são um exemplo local. Cadastro e
          liberação de acesso valem só para esta sessão.
        </p>
      </div>

      <div className="stat-grid">
        <article className="stat-card">
          <FontAwesomeIcon icon={appIcons.users} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Na rede</p>
            <p className="stat-card__value">{estatisticas.total}</p>
          </div>
        </article>

        <article className="stat-card stat-card--ok">
          <FontAwesomeIcon icon={appIcons.active} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Com acesso ativo</p>
            <p className="stat-card__value">{estatisticas.ativos}</p>
          </div>
        </article>

        <article className="stat-card">
          <FontAwesomeIcon icon={appIcons.researcher} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Mestres e doutores</p>
            <p className="stat-card__value">{estatisticas.titulados}</p>
          </div>
        </article>

        {/*
          Não é vaidade de indicador: perfil sem competência declarada não é
          comparável, então essa pessoa é invisível para o matching (RF06).
        */}
        <article className="stat-card stat-card--alert">
          <FontAwesomeIcon icon={appIcons.warning} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Sem competência declarada</p>
            <p className="stat-card__value">{estatisticas.semCompetencia}</p>
          </div>
        </article>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search">
          <FontAwesomeIcon icon={appIcons.search} className="admin-search__icon" />
          <input
            type="search"
            className="admin-search__input"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar por nome, e-mail ou competência..."
            aria-label="Buscar na rede interna"
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
          <label className="sr-only" htmlFor="filtro-papel">Filtrar por papel</label>
          <select
            id="filtro-papel"
            className="admin-input admin-input--select"
            value={papelFiltro}
            onChange={(event) => setPapelFiltro(event.target.value)}
          >
            <option value="todos">Todos os papéis</option>
            {PAPEIS_REDE.map((papel) => (
              <option key={papel.id} value={papel.id}>{papel.label}</option>
            ))}
          </select>

          <label className="sr-only" htmlFor="filtro-situacao">Filtrar por situação</label>
          <select
            id="filtro-situacao"
            className="admin-input admin-input--select"
            value={situacaoFiltro}
            onChange={(event) => setSituacaoFiltro(event.target.value)}
          >
            <option value="todos">Todas as situações</option>
            {SITUACOES.map((situacao) => (
              <option key={situacao.id} value={situacao.id}>{situacao.label}</option>
            ))}
          </select>
        </div>
      </div>

      {temFiltro ? (
        <div className="active-filters" aria-label="Filtros aplicados">
          <span className="rede-page__count">{ordenadas.length} de {pessoas.length}</span>
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
                  className={coluna.id === 'acoes' ? 'admin-table__actions-col' : undefined}
                >
                  {coluna.ordenavel ? (
                    <SortableHeader coluna={coluna} ordem={ordem} onSort={ordenarPor} />
                  ) : (
                    <span className={coluna.id === 'acoes' ? 'sr-only' : undefined}>
                      {coluna.label}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {carregando ? <SkeletonRows colunas={COLUNAS.length} /> : null}

            {!carregando && ordenadas.map((pessoa) => (
              <tr key={pessoa.id}>
                <td data-label="Pessoa">
                  <div className="user-cell">
                    <Avatar nome={pessoa.nome} />
                    <span className="user-cell__text">
                      <span className="user-cell__name">{pessoa.nome}</span>
                      <span className="user-cell__meta">{pessoa.email}</span>
                    </span>
                  </div>
                </td>

                <td data-label="Papel">
                  <span className={`role-badge role-badge--${pessoa.papel}`}>
                    {papelLabel(pessoa.papel)}
                  </span>
                </td>

                <td data-label="Titulação">
                  <span className="user-cell__meta">{titulacaoLabel(pessoa.titulacao)}</span>
                </td>

                <td data-label="Competências">
                  {pessoa.competencias.length > 0 ? (
                    <span className="competencia-lista">
                      {pessoa.competencias.slice(0, 2).map((competencia) => (
                        <span className="admin-tag" key={competencia}>{competencia}</span>
                      ))}
                      {pessoa.competencias.length > 2 ? (
                        <span className="admin-tag">+{pessoa.competencias.length - 2}</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="competencia-lista__vazio">
                      <FontAwesomeIcon icon={appIcons.warning} aria-hidden="true" />
                      Invisível ao matching
                    </span>
                  )}
                </td>

                <td data-label="Situação">
                  <span className={`status-badge status-badge--${pessoa.situacao}`}>
                    <span className="status-badge__dot" aria-hidden="true" />
                    {situacaoLabel(pessoa.situacao)}
                  </span>
                </td>

                <td data-label="Último acesso">
                  <span className="user-cell__meta">{formatarUltimoAcesso(pessoa.ultimoAcesso)}</span>
                </td>

                <td data-label="Ações" className="admin-table__actions-col">
                  <RowActionsMenu
                    label={pessoa.nome}
                    items={[
                      {
                        label: 'Ver ficha',
                        icon: appIcons.view,
                        onSelect: () => setDetalhe(pessoa),
                      },
                      {
                        label: 'Editar cadastro',
                        icon: appIcons.edit,
                        onSelect: () => navigate(`/rede/${pessoa.id}`),
                      },
                      ...(pessoa.situacao === 'ativo'
                        ? [{
                            label: 'Inativar na rede',
                            icon: appIcons.deactivate,
                            onSelect: () => inativar(pessoa),
                          }]
                        : [{
                            label: 'Liberar acesso',
                            icon: appIcons.activate,
                            onSelect: () => liberarAcesso(pessoa),
                          }]),
                    ]}
                  />
                </td>
              </tr>
            ))}

            {!carregando && ordenadas.length === 0 ? (
              <tr>
                <td colSpan={COLUNAS.length}>
                  <TableEmpty
                    icon={appIcons.users}
                    title="Ninguém encontrado na rede."
                    text={
                      temFiltro
                        ? 'Nenhum cadastro corresponde aos filtros aplicados.'
                        : 'Cadastre o primeiro pesquisador para o matching ter sobre quem operar.'
                    }
                    action={
                      temFiltro ? (
                        <button type="button" className="admin-btn admin-btn--outline" onClick={limparFiltros}>
                          Limpar filtros
                        </button>
                      ) : (
                        <Link className="admin-btn" to="/rede/novo">
                          <FontAwesomeIcon icon={appIcons.addUser} />
                          Cadastrar pesquisador
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

      {detalhe ? (
        <AdminModal
          title={detalhe.nome}
          description={`${papelLabel(detalhe.papel)} · ${titulacaoLabel(detalhe.titulacao)}`}
          onClose={() => setDetalhe(null)}
          footer={
            <>
              <button type="button" className="admin-btn admin-btn--outline" onClick={() => setDetalhe(null)}>
                Fechar
              </button>
              <Link className="admin-btn" to={`/rede/${detalhe.id}`}>Editar cadastro</Link>
            </>
          }
        >
          <dl className="detail-list">
            <div className="detail-list__row">
              <dt>E-mail</dt>
              <dd>{detalhe.email}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Instituição</dt>
              <dd>{detalhe.instituicao}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Disponibilidade</dt>
              <dd>{disponibilidadeLabel(detalhe.disponibilidade)}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Competências</dt>
              <dd>{detalhe.competencias.join(' · ') || '—'}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Técnicas</dt>
              <dd>{detalhe.tecnicas.join(' · ') || '—'}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Linhas</dt>
              <dd>{detalhe.linhas.join(' · ') || '—'}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Experiência</dt>
              <dd>{detalhe.experiencia || '—'}</dd>
            </div>
          </dl>
        </AdminModal>
      ) : null}

      <AdminToast toast={toast} />
    </div>
  )
}
