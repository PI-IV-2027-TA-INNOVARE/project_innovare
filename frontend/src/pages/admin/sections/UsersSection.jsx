import { useEffect, useMemo, useState } from 'react'
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
import UserFormModal from './users/UserFormModal'
import {
  PERFIS,
  STATUS,
  USUARIOS_EXEMPLO,
  formatarUltimoAcesso,
  perfilLabel,
  statusLabel,
  usuariosParaCsv,
} from './users/usersData'

/**
 * Gestão de contas, perfis e acessos.
 *
 * A lista é um placeholder local, sinalizado na interface: o backend ainda não
 * expõe os quatro atores da baseline, e inventar contrato de API violaria
 * "contratos blindados" (AGENTS.md §1). Criar, editar e excluir mexem em estado
 * de sessão — a ligação real está na Fase 2 do PLANO_IMPLEMENTACAO.md.
 */

const COLUNAS = [
  { id: 'nome', label: 'Usuário', ordenavel: true },
  { id: 'email', label: 'E-mail', ordenavel: true },
  { id: 'perfil', label: 'Perfil', ordenavel: true },
  { id: 'status', label: 'Situação', ordenavel: true },
  { id: 'ultimoAcesso', label: 'Último acesso', ordenavel: true },
  { id: 'acoes', label: 'Ações', ordenavel: false },
]

const POR_PAGINA = [10, 25, 50]

function comparar(a, b, campo) {
  if (campo === 'ultimoAcesso') return a.ultimoAcesso - b.ultimoAcesso
  if (campo === 'perfil') return perfilLabel(a.perfil).localeCompare(perfilLabel(b.perfil), 'pt-BR')
  if (campo === 'status') return statusLabel(a.status).localeCompare(statusLabel(b.status), 'pt-BR')

  return String(a[campo]).localeCompare(String(b[campo]), 'pt-BR', { sensitivity: 'base' })
}

export default function UsersSection() {
  const [usuarios, setUsuarios] = useState(USUARIOS_EXEMPLO)
  const [carregando, setCarregando] = useState(true)

  const [busca, setBusca] = useState('')
  const [perfilFiltro, setPerfilFiltro] = useState('todos')
  const [statusFiltro, setStatusFiltro] = useState('todos')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  const [ordem, setOrdem] = useState({ campo: 'nome', direcao: 'asc' })
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(10)

  const [modal, setModal] = useState(null)
  const [avisoAberto, setAvisoAberto] = useState(false)

  const { toast, showToast } = useToast()

  // Marca o lugar da requisição da Fase 2: a tabela já nasce sabendo desenhar o
  // estado de carregamento, para não virar refatoração quando o endpoint chegar.
  useEffect(() => {
    const timer = setTimeout(() => setCarregando(false), 450)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    setPagina(1)
  }, [busca, perfilFiltro, statusFiltro, porPagina])

  const estatisticas = useMemo(() => ({
    total: usuarios.length,
    ativos: usuarios.filter((usuario) => usuario.status === 'ativo').length,
    pesquisadores: usuarios.filter((usuario) => usuario.perfil === 'pesquisador').length,
    demandantes: usuarios.filter((usuario) => usuario.perfil === 'demandante').length,
  }), [usuarios])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return usuarios.filter((usuario) => {
      const perfilOk = perfilFiltro === 'todos' || usuario.perfil === perfilFiltro
      const statusOk = statusFiltro === 'todos' || usuario.status === statusFiltro
      const buscaOk =
        !termo ||
        usuario.nome.toLowerCase().includes(termo) ||
        usuario.email.toLowerCase().includes(termo)

      return perfilOk && statusOk && buscaOk
    })
  }, [busca, perfilFiltro, statusFiltro, usuarios])

  const ordenados = useMemo(() => {
    const fator = ordem.direcao === 'asc' ? 1 : -1
    return [...filtrados].sort((a, b) => comparar(a, b, ordem.campo) * fator)
  }, [filtrados, ordem])

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / porPagina))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const inicio = (paginaAtual - 1) * porPagina
  const visiveis = ordenados.slice(inicio, inicio + porPagina)

  const temFiltro = Boolean(busca) || perfilFiltro !== 'todos' || statusFiltro !== 'todos'

  const ordenarPor = (campo) => {
    setOrdem((atual) => ({
      campo,
      direcao: atual.campo === campo && atual.direcao === 'asc' ? 'desc' : 'asc',
    }))
  }

  const limparFiltros = () => {
    setBusca('')
    setPerfilFiltro('todos')
    setStatusFiltro('todos')
  }

  const criarUsuario = (dados) => {
    const id = Math.max(0, ...usuarios.map((usuario) => usuario.id)) + 1

    setUsuarios((atual) => [{ ...dados, id, ultimoAcesso: null }, ...atual])
    setModal(null)
    showToast('Usuário criado com sucesso.')
  }

  const salvarUsuario = (dados) => {
    setUsuarios((atual) => atual.map((usuario) => (usuario.id === dados.id ? { ...usuario, ...dados } : usuario)))
    setModal(null)
    showToast('Alterações salvas.')
  }

  const excluirUsuario = (usuario) => {
    setUsuarios((atual) => atual.filter((item) => item.id !== usuario.id))
    setModal(null)
    showToast('Usuário removido.', 'error')
  }

  const alternarStatus = (usuario) => {
    const proximo = usuario.status === 'ativo' ? 'inativo' : 'ativo'

    setUsuarios((atual) =>
      atual.map((item) => (item.id === usuario.id ? { ...item, status: proximo } : item))
    )

    showToast(`Acesso de ${usuario.nome} ${proximo === 'ativo' ? 'ativado' : 'inativado'}.`)
  }

  const exportarCsv = () => {
    try {
      const blob = new Blob([`﻿${usuariosParaCsv(ordenados)}`], {
        type: 'text/csv;charset=utf-8;',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = `usuarios-pd-connect-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      showToast(`${ordenados.length} registros exportados.`)
    } catch {
      showToast('Não foi possível gerar o arquivo neste navegador.', 'error')
    }
  }

  return (
    <div className="admin-section">
      <header className="admin-section__header">
        <div className="admin-section__heading">
          <h2 className="admin-section__title">Usuários</h2>
          <p className="admin-section__subtitle">
            Contas, perfis e acessos da plataforma. O Administrador gerencia o
            acesso; as atribuições científicas e decisórias permanecem com o
            Supervisor.
          </p>
        </div>
      </header>

      <div className="admin-callout" role="note">
        <FontAwesomeIcon icon={appIcons.info} className="admin-callout__icon" />
        <p className="admin-callout__text">
          Interface preliminar — os registros são um exemplo local.
        </p>
        <button
          type="button"
          className="link-button"
          aria-expanded={avisoAberto}
          onClick={() => setAvisoAberto((aberto) => !aberto)}
        >
          {avisoAberto ? 'Ocultar' : 'Saiba mais'}
        </button>

        {avisoAberto ? (
          <p className="admin-callout__detail">
            O backend ainda modela apenas <code>pesquisador</code> e{' '}
            <code>empresa</code>. Os quatro atores da baseline v1.0 e os endpoints
            de administração entram na Fase 2 do plano; criar, editar e excluir
            valem só para esta sessão.
          </p>
        ) : null}
      </div>

      <div className="stat-grid">
        <article className="stat-card">
          <FontAwesomeIcon icon={appIcons.users} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Usuários totais</p>
            <p className="stat-card__value">{estatisticas.total}</p>
          </div>
        </article>

        <article className="stat-card stat-card--ok">
          <FontAwesomeIcon icon={appIcons.active} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Usuários ativos</p>
            <p className="stat-card__value">{estatisticas.ativos}</p>
          </div>
        </article>

        <article className="stat-card">
          <FontAwesomeIcon icon={appIcons.researcher} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Pesquisadores</p>
            <p className="stat-card__value">{estatisticas.pesquisadores}</p>
          </div>
        </article>

        <article className="stat-card">
          <FontAwesomeIcon icon={appIcons.company} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Demandantes</p>
            <p className="stat-card__value">{estatisticas.demandantes}</p>
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
            placeholder="Buscar por nome ou e-mail..."
            aria-label="Buscar por nome ou e-mail"
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
          <button
            type="button"
            className={`admin-btn admin-btn--outline${filtrosAbertos ? ' is-active' : ''}`}
            aria-expanded={filtrosAbertos}
            onClick={() => setFiltrosAbertos((aberto) => !aberto)}
            title="Filtros avançados"
          >
            <FontAwesomeIcon icon={appIcons.filter} />
            Filtros avançados
          </button>

          <button
            type="button"
            className="admin-btn admin-btn--outline"
            onClick={exportarCsv}
            title="Exportar a lista filtrada em CSV"
          >
            <FontAwesomeIcon icon={appIcons.export} />
            Exportar CSV
          </button>

          <button
            type="button"
            className="admin-btn"
            onClick={() => setModal({ tipo: 'novo' })}
            title="Cadastrar uma nova conta"
          >
            <FontAwesomeIcon icon={appIcons.addUser} />
            Novo usuário
          </button>
        </div>
      </div>

      {filtrosAbertos ? (
        <div className="filter-panel">
          <fieldset className="filter-panel__group">
            <legend className="filter-panel__legend">Perfil</legend>
            <div className="chip-row">
              <button
                type="button"
                className={`chip${perfilFiltro === 'todos' ? ' is-selected' : ''}`}
                aria-pressed={perfilFiltro === 'todos'}
                onClick={() => setPerfilFiltro('todos')}
              >
                Todos os perfis
              </button>

              {PERFIS.map((perfil) => (
                <button
                  key={perfil.id}
                  type="button"
                  className={`chip${perfilFiltro === perfil.id ? ' is-selected' : ''}`}
                  aria-pressed={perfilFiltro === perfil.id}
                  onClick={() => setPerfilFiltro(perfil.id)}
                >
                  {perfil.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-panel__group">
            <legend className="filter-panel__legend">Situação</legend>
            <div className="chip-row">
              <button
                type="button"
                className={`chip${statusFiltro === 'todos' ? ' is-selected' : ''}`}
                aria-pressed={statusFiltro === 'todos'}
                onClick={() => setStatusFiltro('todos')}
              >
                Todas
              </button>

              {STATUS.map((status) => (
                <button
                  key={status.id}
                  type="button"
                  className={`chip${statusFiltro === status.id ? ' is-selected' : ''}`}
                  aria-pressed={statusFiltro === status.id}
                  onClick={() => setStatusFiltro(status.id)}
                >
                  {status.label}s
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}

      {temFiltro ? (
        <div className="active-filters" aria-label="Filtros aplicados">
          {busca ? (
            <button type="button" className="chip chip--removable" onClick={() => setBusca('')}>
              Busca: {busca}
              <FontAwesomeIcon icon={appIcons.clear} />
              <span className="sr-only">Remover filtro de busca</span>
            </button>
          ) : null}

          {perfilFiltro !== 'todos' ? (
            <button
              type="button"
              className="chip chip--removable"
              onClick={() => setPerfilFiltro('todos')}
            >
              Perfil: {perfilLabel(perfilFiltro)}
              <FontAwesomeIcon icon={appIcons.clear} />
              <span className="sr-only">Remover filtro de perfil</span>
            </button>
          ) : null}

          {statusFiltro !== 'todos' ? (
            <button
              type="button"
              className="chip chip--removable"
              onClick={() => setStatusFiltro('todos')}
            >
              Situação: {statusLabel(statusFiltro)}
              <FontAwesomeIcon icon={appIcons.clear} />
              <span className="sr-only">Remover filtro de situação</span>
            </button>
          ) : null}

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
                    <span className="sr-only">{coluna.label}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {carregando ? <SkeletonRows colunas={COLUNAS.length} /> : null}

            {!carregando && visiveis.map((usuario) => (
              <tr key={usuario.id}>
                <td data-label="Usuário">
                  <div className="user-cell">
                    <Avatar nome={usuario.nome} />
                    <span className="user-cell__text">
                      <span className="user-cell__name">{usuario.nome}</span>
                      <span className="user-cell__meta">{usuario.instituicao}</span>
                    </span>
                  </div>
                </td>

                <td data-label="E-mail">
                  <span className="user-cell__email">{usuario.email}</span>
                </td>

                <td data-label="Perfil">
                  <span className={`role-badge role-badge--${usuario.perfil}`}>
                    {perfilLabel(usuario.perfil)}
                  </span>
                </td>

                <td data-label="Situação">
                  <span className={`status-badge status-badge--${usuario.status}`}>
                    <span className="status-badge__dot" aria-hidden="true" />
                    {statusLabel(usuario.status)}
                  </span>
                </td>

                <td data-label="Último acesso">
                  <span className="user-cell__meta">{formatarUltimoAcesso(usuario.ultimoAcesso)}</span>
                </td>

                <td data-label="Ações" className="admin-table__actions-col">
                  <RowActionsMenu
                    label={usuario.nome}
                    items={[
                      {
                        label: 'Visualizar perfil',
                        icon: appIcons.view,
                        onSelect: () => setModal({ tipo: 'ver', usuario }),
                      },
                      {
                        label: 'Editar usuário',
                        icon: appIcons.edit,
                        onSelect: () => setModal({ tipo: 'editar', usuario }),
                      },
                      {
                        label: 'Alterar perfil',
                        icon: appIcons.role,
                        onSelect: () => setModal({ tipo: 'editar', usuario }),
                      },
                      {
                        label: usuario.status === 'ativo' ? 'Inativar acesso' : 'Ativar acesso',
                        icon: usuario.status === 'ativo' ? appIcons.deactivate : appIcons.activate,
                        onSelect: () => alternarStatus(usuario),
                      },
                      {
                        label: 'Excluir usuário',
                        icon: appIcons.remove,
                        tone: 'danger',
                        onSelect: () => setModal({ tipo: 'excluir', usuario }),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}

            {!carregando && visiveis.length === 0 ? (
              <tr>
                <td colSpan={COLUNAS.length}>
                  <TableEmpty
                    icon={appIcons.users}
                    title="Nenhum usuário encontrado."
                    text={
                      temFiltro
                        ? 'Nenhuma conta corresponde aos filtros aplicados.'
                        : 'Cadastre a primeira conta para começar a gerenciar acessos.'
                    }
                    action={
                      temFiltro ? (
                        <button type="button" className="admin-btn admin-btn--outline" onClick={limparFiltros}>
                          Limpar filtros
                        </button>
                      ) : (
                        <button type="button" className="admin-btn" onClick={() => setModal({ tipo: 'novo' })}>
                          <FontAwesomeIcon icon={appIcons.addUser} />
                          Criar primeiro usuário
                        </button>
                      )
                    }
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <nav className="pagination" aria-label="Paginação da lista de usuários">
        <p className="pagination__summary">
          {ordenados.length === 0
            ? 'Nenhum registro'
            : `Mostrando ${inicio + 1}–${Math.min(inicio + porPagina, ordenados.length)} de ${ordenados.length}`}
          {ordenados.length !== usuarios.length ? ` (${usuarios.length} no total)` : ''}
        </p>

        <div className="pagination__controls">
          <label className="pagination__size">
            Linhas por página
            <select
              className="admin-input admin-input--compact"
              value={porPagina}
              onChange={(event) => setPorPagina(Number(event.target.value))}
              aria-label="Linhas por página"
            >
              {POR_PAGINA.map((quantidade) => (
                <option key={quantidade} value={quantidade}>{quantidade}</option>
              ))}
            </select>
          </label>

          <span className="pagination__page">Página {paginaAtual} de {totalPaginas}</span>

          <div className="pagination__buttons">
            <button
              type="button"
              className="icon-button"
              onClick={() => setPagina(1)}
              disabled={paginaAtual === 1}
              title="Primeira página"
              aria-label="Primeira página"
            >
              <FontAwesomeIcon icon={appIcons.first} />
            </button>

            <button
              type="button"
              className="icon-button"
              onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
              disabled={paginaAtual === 1}
              title="Página anterior"
              aria-label="Página anterior"
            >
              <FontAwesomeIcon icon={appIcons.previous} />
            </button>

            <button
              type="button"
              className="icon-button"
              onClick={() => setPagina((atual) => Math.min(totalPaginas, atual + 1))}
              disabled={paginaAtual === totalPaginas}
              title="Próxima página"
              aria-label="Próxima página"
            >
              <FontAwesomeIcon icon={appIcons.next} />
            </button>

            <button
              type="button"
              className="icon-button"
              onClick={() => setPagina(totalPaginas)}
              disabled={paginaAtual === totalPaginas}
              title="Última página"
              aria-label="Última página"
            >
              <FontAwesomeIcon icon={appIcons.last} />
            </button>
          </div>
        </div>
      </nav>

      {modal?.tipo === 'novo' ? (
        <UserFormModal onSubmit={criarUsuario} onClose={() => setModal(null)} />
      ) : null}

      {modal?.tipo === 'editar' ? (
        <UserFormModal
          usuario={modal.usuario}
          onSubmit={salvarUsuario}
          onClose={() => setModal(null)}
        />
      ) : null}

      {modal?.tipo === 'ver' ? (
        <AdminModal
          title={modal.usuario.nome}
          description={perfilLabel(modal.usuario.perfil)}
          onClose={() => setModal(null)}
          footer={
            <button type="button" className="admin-btn admin-btn--outline" onClick={() => setModal(null)}>
              Fechar
            </button>
          }
        >
          <dl className="detail-list">
            <div className="detail-list__row">
              <dt>E-mail</dt>
              <dd>{modal.usuario.email}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Instituição</dt>
              <dd>{modal.usuario.instituicao || '—'}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Situação</dt>
              <dd>
                <span className={`status-badge status-badge--${modal.usuario.status}`}>
                  <span className="status-badge__dot" aria-hidden="true" />
                  {statusLabel(modal.usuario.status)}
                </span>
              </dd>
            </div>
            <div className="detail-list__row">
              <dt>Último acesso</dt>
              <dd>{formatarUltimoAcesso(modal.usuario.ultimoAcesso)}</dd>
            </div>
          </dl>
        </AdminModal>
      ) : null}

      {modal?.tipo === 'excluir' ? (
        <AdminModal
          title="Excluir usuário"
          description={`A conta de ${modal.usuario.nome} perde o acesso imediatamente. A ação não pode ser desfeita.`}
          size="sm"
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" className="admin-btn admin-btn--outline" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                onClick={() => excluirUsuario(modal.usuario)}
              >
                <FontAwesomeIcon icon={appIcons.remove} />
                Excluir usuário
              </button>
            </>
          }
        >
          <div className="user-cell">
            <Avatar nome={modal.usuario.nome} />
            <span className="user-cell__text">
              <span className="user-cell__name">{modal.usuario.nome}</span>
              <span className="user-cell__meta">{modal.usuario.email}</span>
            </span>
          </div>
        </AdminModal>
      ) : null}

      <AdminToast toast={toast} />
    </div>
  )
}
