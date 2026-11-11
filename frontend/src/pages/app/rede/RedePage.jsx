import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAtualizarAoFocar } from '../../../lib/atualizarAoFocar'
import {
  RowActionsMenu,
  SkeletonRows,
  SortableHeader,
  TableEmpty,
} from '../../../components/console/ConsoleTable'
import { BotaoPessoa, FichaDePessoa } from '../../../components/console/Pessoa'
import RodapeDePaginacao from '../../../components/console/RodapeDePaginacao'
import { AdminToast, useToast } from '../../../components/console/toast'
import { Icone, appIcons } from '../../../lib/icons'
import { TODAS_AS_LINHAS, useLinhasPorPagina } from '../../../lib/linhasPorPagina'
import { todasAsPaginas } from '../../../lib/paginas'
import {
  inativarMembro,
  liberarAcessoMembro,
  listarRede,
  obterResumoDaRede,
  reativarMembro,
} from '../../../services/pdConnectApi'
import {
  PAPEIS_REDE,
  SITUACOES,
  disponibilidadeLabel,
  membroDaApi,
  papelLabel,
  situacaoLabel,
  titulacaoLabel,
} from './redeData'
import './RedePage.scss'

const COLUNAS = [
  { id: 'nome', label: 'Pessoa', ordenavel: true },
  { id: 'papel', label: 'Papel', ordenavel: true },
  { id: 'titulacao', label: 'Titulação', ordenavel: true },
  { id: 'competencias', label: 'Competências', ordenavel: false },
  { id: 'situacao', label: 'Situação', ordenavel: true },
  { id: 'disponibilidade', label: 'Disponibilidade', ordenavel: true },
  { id: 'acoes', label: 'Ações', ordenavel: false },
]

const ESPERA_DA_BUSCA_MS = 300

const RESUMO_VAZIO = { total: 0, ativos: 0, titulados: 0, sem_competencia: 0 }

export default function RedePage() {
  const navigate = useNavigate()
  const { toast, showToast } = useToast()
  const [parametros, setParametros] = useSearchParams()

  const [pessoas, setPessoas] = useState([])
  const [total, setTotal] = useState(0)
  const [resumo, setResumo] = useState(RESUMO_VAZIO)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [papelFiltro, setPapelFiltro] = useState('todos')
  const [situacaoFiltro, setSituacaoFiltro] = useState('todos')
  const [soSemCompetencia, setSoSemCompetencia] = useState(
    () => parametros.get('sem_competencia') === '1'
  )
  const [ordem, setOrdem] = useState({ campo: 'nome', direcao: 'asc' })
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useLinhasPorPagina('rede', 25)
  const [detalhe, setDetalhe] = useState(null)
  const [liberando, setLiberando] = useState(() => new Set())

  useEffect(() => {
    const termo = busca.trim()

    if (termo === buscaAplicada) return undefined

    const relogio = setTimeout(() => {
      setBuscaAplicada(termo)
      setPagina(1)
    }, ESPERA_DA_BUSCA_MS)

    return () => clearTimeout(relogio)
  }, [busca, buscaAplicada])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErroCarga('')

    const filtros = {
      busca: buscaAplicada,
      papel_rede: papelFiltro === 'todos' ? '' : papelFiltro,
      situacao: situacaoFiltro === 'todos' ? '' : situacaoFiltro,
      sem_competencia: soSemCompetencia ? 'true' : '',
      ordenar: (ordem.direcao === 'desc' ? '-' : '') + ordem.campo,
    }

    try {
      if (porPagina === TODAS_AS_LINHAS) {
        const rede = await todasAsPaginas(listarRede, { ...filtros, page_size: 100 })
        setPessoas(rede.map(membroDaApi))
        setTotal(rede.length)
        return
      }

      const resposta = await listarRede({ ...filtros, page: pagina, page_size: porPagina })
      const resultados = resposta.results || resposta
      setPessoas(resultados.map(membroDaApi))
      setTotal(resposta.count ?? resultados.length)
    } catch (falha) {
      setPessoas([])
      setTotal(0)
      setErroCarga(falha?.message || 'Não foi possível carregar a rede interna.')
    } finally {
      setCarregando(false)
    }
  }, [buscaAplicada, ordem, pagina, porPagina, papelFiltro, situacaoFiltro, soSemCompetencia])

  const carregarResumo = useCallback(async () => {
    try {
      setResumo(await obterResumoDaRede())
    } catch {
      setResumo(RESUMO_VAZIO)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    carregarResumo()
  }, [carregarResumo])

  const atualizar = useCallback(() => {
    carregar()
    carregarResumo()
  }, [carregar, carregarResumo])

  useAtualizarAoFocar(atualizar)

  const temFiltro =
    Boolean(busca) || papelFiltro !== 'todos' || situacaoFiltro !== 'todos' || soSemCompetencia

  const tamanhoDaPagina = porPagina === TODAS_AS_LINHAS ? Math.max(total, 1) : porPagina
  const totalPaginas = Math.max(1, Math.ceil(total / tamanhoDaPagina))
  const inicio = (pagina - 1) * tamanhoDaPagina

  const escolherLinhas = (valor) => {
    setPorPagina(valor)
    setPagina(1)
  }

  const ordenarPor = (campo) => {
    setOrdem((atual) => ({
      campo,
      direcao: atual.campo === campo && atual.direcao === 'asc' ? 'desc' : 'asc',
    }))
    setPagina(1)
  }

  const filtrarPapel = (valor) => {
    setPapelFiltro(valor)
    setPagina(1)
  }

  const filtrarSituacao = (valor) => {
    setSituacaoFiltro(valor)
    setPagina(1)
  }

  const recortarSemCompetencia = (ligado) => {
    setSoSemCompetencia(ligado)
    setParametros(ligado ? { sem_competencia: '1' } : {}, { replace: true })
    setPagina(1)
  }

  const limparFiltros = () => {
    setBusca('')
    setBuscaAplicada('')
    setPapelFiltro('todos')
    setSituacaoFiltro('todos')
    recortarSemCompetencia(false)
  }

  const marcarLiberando = (id, emAndamento) => {
    setLiberando((atual) => {
      const proximo = new Set(atual)
      if (emAndamento) proximo.add(id)
      else proximo.delete(id)
      return proximo
    })
  }

  const liberarAcesso = async (pessoa) => {
    if (liberando.has(pessoa.id)) return

    marcarLiberando(pessoa.id, true)
    showToast(`Liberando o acesso de ${pessoa.nome} e enviando o convite por e-mail...`)

    try {
      const atualizado = membroDaApi(await liberarAcessoMembro(pessoa.id))

      setPessoas((atual) =>
        atual.map((item) => (item.id === pessoa.id ? atualizado : item))
      )
      carregarResumo()
      showToast(`Acesso liberado para ${pessoa.nome}. O convite saiu por e-mail.`)
    } catch (falha) {
      showToast(falha?.message || `Não foi possível liberar o acesso de ${pessoa.nome}.`)
    } finally {
      marcarLiberando(pessoa.id, false)
    }
  }

  const mudarSituacao = async (pessoa, inativar) => {
    if (
      inativar &&
      !window.confirm(
        `Inativar ${pessoa.nome}? A pessoa sai das próximas rodadas de matching e perde o acesso à plataforma. As equipes já geradas continuam com ela.`,
      )
    ) {
      return
    }

    try {
      const acao = inativar ? inativarMembro : reativarMembro
      const atualizado = membroDaApi(await acao(pessoa.id))

      setPessoas((atual) =>
        atual.map((item) => (item.id === pessoa.id ? atualizado : item))
      )
      carregarResumo()
      showToast(
        inativar
          ? `${pessoa.nome} saiu da rede e não entra mais na plataforma.`
          : `${pessoa.nome} voltou para a rede.`,
      )
    } catch (falha) {
      showToast(falha?.message || 'Não foi possível mudar a situação.')
    }
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
            Pesquisadores e supervisores da AC2. O matching opera somente
            sobre esta rede.
          </p>
        </div>

        <Link className="admin-btn" to="/rede/novo">
          <Icone icon={appIcons.addUser} />
          Cadastrar pesquisador
        </Link>
      </header>

      {erroCarga ? (
        <div className="admin-callout" role="alert">
          <Icone icon={appIcons.warning} className="admin-callout__icon" />
          <p className="admin-callout__text">{erroCarga}</p>
          <button type="button" className="link-button" onClick={atualizar}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      <div className="stat-grid">
        <article className="stat-card">
          <Icone icon={appIcons.users} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Na rede</p>
            <p className="stat-card__value">{resumo.total}</p>
          </div>
        </article>

        <article className="stat-card stat-card--ok">
          <Icone icon={appIcons.active} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Com acesso ativo</p>
            <p className="stat-card__value">{resumo.ativos}</p>
          </div>
        </article>

        <article className="stat-card">
          <Icone icon={appIcons.researcher} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Mestres e doutores</p>
            <p className="stat-card__value">{resumo.titulados}</p>
          </div>
        </article>

        <article className="stat-card stat-card--alert">
          <Icone icon={appIcons.warning} className="stat-card__icon" />
          <div>
            <p className="stat-card__label">Sem competência declarada</p>
            <p className="stat-card__value">{resumo.sem_competencia}</p>
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
              <Icone icon={appIcons.clear} />
            </button>
          ) : null}
        </div>

        <div className="admin-toolbar__actions">
          <button
            type="button"
            className={`admin-btn admin-btn--outline${soSemCompetencia ? ' is-active' : ''}`}
            aria-pressed={soSemCompetencia}
            title="Quem não declarou competência fica de fora do matching."
            onClick={() => recortarSemCompetencia(!soSemCompetencia)}
          >
            Sem competência declarada ({resumo.sem_competencia})
          </button>

          <label className="sr-only" htmlFor="filtro-papel">Filtrar por papel</label>
          <select
            id="filtro-papel"
            className="admin-input admin-input--select"
            value={papelFiltro}
            onChange={(event) => filtrarPapel(event.target.value)}
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
            onChange={(event) => filtrarSituacao(event.target.value)}
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
          <span className="rede-page__count">{total} de {resumo.total}</span>
          <button type="button" className="link-button" onClick={limparFiltros}>
            Limpar filtros
          </button>
        </div>
      ) : null}

      <div className="admin-table-wrap">
        <table className="admin-table admin-table--users">
          <caption className="sr-only">Pessoas cadastradas na rede interna da AC2</caption>
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

            {!carregando && pessoas.map((pessoa) => (
              <tr key={pessoa.id}>
                <td data-label="Pessoa">
                  <BotaoPessoa
                    nome={pessoa.nome}
                    meta={pessoa.email}
                    onClick={() => setDetalhe(pessoa)}
                  />
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
                      <Icone icon={appIcons.warning} aria-hidden="true" />
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

                <td data-label="Disponibilidade">
                  <span className="user-cell__meta">
                    {disponibilidadeLabel(pessoa.disponibilidade)}
                  </span>
                </td>

                <td data-label="Ações" className="admin-table__actions-col">
                  <RowActionsMenu
                    label={pessoa.nome}
                    items={[
                      {
                        label: 'Editar cadastro',
                        icon: appIcons.edit,
                        onSelect: () => navigate(`/rede/${pessoa.id}`),
                      },
                      ...(pessoa.temAcesso || pessoa.situacao === 'inativo'
                        ? []
                        : [liberando.has(pessoa.id)
                          ? {
                              label: 'Liberando acesso...',
                              icon: appIcons.activate,
                              disabled: true,
                              onSelect: () => {},
                            }
                          : {
                              label: 'Liberar acesso',
                              icon: appIcons.activate,
                              onSelect: () => liberarAcesso(pessoa),
                            }]),
                      pessoa.situacao === 'inativo'
                        ? {
                            label: 'Reativar na rede',
                            icon: appIcons.activate,
                            onSelect: () => mudarSituacao(pessoa, false),
                          }
                        : {
                            label: 'Inativar na rede',
                            icon: appIcons.deactivate,
                            tone: 'danger',
                            onSelect: () => mudarSituacao(pessoa, true),
                          },
                    ]}
                  />
                </td>
              </tr>
            ))}

            {!carregando && pessoas.length === 0 ? (
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
                          <Icone icon={appIcons.addUser} />
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

      {!carregando ? (
        <RodapeDePaginacao
          rotulo="Paginação da rede interna"
          total={total}
          inicio={inicio}
          fim={inicio + pessoas.length}
          pagina={pagina}
          totalPaginas={totalPaginas}
          porPagina={porPagina}
          onPagina={setPagina}
          onPorPagina={escolherLinhas}
        />
      ) : null}

      {detalhe ? (
        <FichaDePessoa
          nome={detalhe.nome}
          descricao={`${papelLabel(detalhe.papel)} · ${titulacaoLabel(detalhe.titulacao)}`}
          onFechar={() => setDetalhe(null)}
          acoes={<Link className="admin-btn" to={`/rede/${detalhe.id}`}>Editar cadastro</Link>}
          linhas={[
            { rotulo: 'E-mail', valor: detalhe.email },
            {
              rotulo: 'Situação',
              valor: (
                <span className={`status-badge status-badge--${detalhe.situacao}`}>
                  <span className="status-badge__dot" aria-hidden="true" />
                  {situacaoLabel(detalhe.situacao)}
                </span>
              ),
            },
            { rotulo: 'Instituição', valor: detalhe.instituicao },
            { rotulo: 'Disponibilidade', valor: disponibilidadeLabel(detalhe.disponibilidade) },
            { rotulo: 'Competências', valor: detalhe.competencias.join(' · ') || '—' },
            { rotulo: 'Técnicas', valor: detalhe.tecnicas.join(' · ') || '—' },
            { rotulo: 'Linhas', valor: detalhe.linhas.join(' · ') || '—' },
            { rotulo: 'Experiência', valor: detalhe.experiencia || '—' },
          ]}
        />
      ) : null}

      <AdminToast toast={toast} />
    </div>
  )
}
