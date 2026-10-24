import { useCallback, useEffect, useState } from 'react'
import { SkeletonRows, TableEmpty } from '../../../components/console/ConsoleTable'
import { appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { listarTrilha, obterFiltrosTrilha } from '../../../services/pdConnectApi'

const COLUNAS = [
  { id: 'quando', label: 'Quando' },
  { id: 'categoria', label: 'Categoria' },
  { id: 'evento', label: 'Evento' },
  { id: 'ator', label: 'Quem' },
  { id: 'alvo', label: 'Sobre' },
  { id: 'situacao', label: 'Situação' },
]

const FILTRO_VAZIO = { categoria: '', status: '', busca: '', desde: '', ate: '' }

const ATOR_SISTEMA = '__sistema__'

const CATALOGO_VAZIO = { categorias: [], status: [], rotina_oculta: null }

/**
 * O marcador do servidor não é nome de gente.
 *
 * `__sistema__` identifica o que rodou sem ator humano. Mostrado cru, faz o
 * Administrador procurar uma conta com esse login.
 */
function nomeDoAtor(evento) {
  if (evento.ator === ATOR_SISTEMA) return 'Sistema'
  return evento.ator_nome || evento.ator
}

const itensAlterados = (total) =>
  `${total} ${total === 1 ? 'item alterado' : 'itens alterados'}`

function somenteOsPreenchidos(filtros) {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, valor]) => String(valor).trim())
  )
}

export default function AuditoriaSection() {
  const [rascunho, setRascunho] = useState(FILTRO_VAZIO)
  const [aplicados, setAplicados] = useState(FILTRO_VAZIO)

  const [catalogo, setCatalogo] = useState(CATALOGO_VAZIO)
  const [eventos, setEventos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    obterFiltrosTrilha()
      .then(setCatalogo)
      .catch(() => setCatalogo(CATALOGO_VAZIO))
  }, [])

  const consultar = useCallback(async (filtros) => {
    setCarregando(true)

    try {
      const pagina = await listarTrilha(somenteOsPreenchidos(filtros))

      setEventos(pagina.results || [])
      setErro('')
    } catch {
      setEventos([])
      setErro('Não foi possível carregar a trilha. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    consultar(aplicados)
  }, [aplicados, consultar])

  const alterar = (campo) => (event) => {
    const { value } = event.target

    setRascunho((atual) => ({ ...atual, [campo]: value }))
    setErro('')

    if (campo === 'categoria' || campo === 'status') {
      setAplicados((atual) => ({ ...atual, [campo]: value }))
    }
  }

  const aplicar = (event) => {
    event.preventDefault()

    if (rascunho.desde && rascunho.ate && rascunho.desde > rascunho.ate) {
      setErro('O início do período é posterior ao fim.')
      return
    }

    setAplicados(rascunho)
  }

  const limpar = () => {
    setRascunho(FILTRO_VAZIO)
    setAplicados(FILTRO_VAZIO)
    setErro('')
  }

  const temFiltro = Object.values(aplicados).some((valor) => String(valor).trim())

  return (
    <section className="console-section">
      <header className="console-section__header">
        <div>
          <h2 className="console-section__title">Auditoria</h2>
          <p className="console-section__description">
            O que aconteceu na plataforma. Registro permanente: a trilha não é
            editada nem apagada por ninguém, inclusive por aqui.
          </p>
        </div>
      </header>

      <form className="console-form console-form--filtros" onSubmit={aplicar}>
        <div className="console-form__field">
          <label className="form-label" htmlFor="trilha-busca">
            Buscar por pessoa, oportunidade ou evento
          </label>
          <input
            id="trilha-busca"
            type="search"
            className="form-input"
            value={rascunho.busca}
            onChange={alterar('busca')}
            placeholder="Ex.: Rafael ou OP-2026-001"
          />
        </div>

        <div className="console-form__field">
          <label className="form-label" htmlFor="trilha-categoria">
            Categoria
          </label>
          <select
            id="trilha-categoria"
            className="form-input"
            value={rascunho.categoria}
            onChange={alterar('categoria')}
          >
            <option value="">Todas</option>
            {catalogo.categorias.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className="console-form__field">
          <label className="form-label" htmlFor="trilha-status">
            Situação
          </label>
          <select
            id="trilha-status"
            className="form-input"
            value={rascunho.status}
            onChange={alterar('status')}
          >
            <option value="">Todas</option>
            {catalogo.status.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className="console-form__field">
          <label className="form-label" htmlFor="trilha-desde">
            De
          </label>
          <input
            id="trilha-desde"
            type="date"
            className="form-input"
            value={rascunho.desde}
            onChange={alterar('desde')}
          />
        </div>

        <div className="console-form__field">
          <label className="form-label" htmlFor="trilha-ate">
            Até
          </label>
          <input
            id="trilha-ate"
            type="date"
            className="form-input"
            value={rascunho.ate}
            onChange={alterar('ate')}
          />
        </div>

        <div className="console-form__actions">
          <button type="submit" className="admin-btn admin-btn--primary">
            Aplicar
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--outline"
            onClick={limpar}
          >
            Limpar
          </button>
        </div>
      </form>

      {catalogo.rotina_oculta && aplicados.categoria !== catalogo.rotina_oculta.categoria ? (
        <p className="trilha__nota">
          Entradas e saídas da plataforma ficam fora desta lista para não
          esconder o restante: escolha a categoria{' '}
          {catalogo.categorias.find(
            (item) => item.valor === catalogo.rotina_oculta.categoria
          )?.rotulo || 'Conta e acesso'}{' '}
          para vê-las.
        </p>
      ) : null}

      {erro ? (
        <p className="login-message" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <caption className="sr-only">Trilha de auditoria da plataforma</caption>
          <thead>
            <tr>
              {COLUNAS.map((coluna) => (
                <th key={coluna.id} scope="col">
                  {coluna.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {carregando ? <SkeletonRows colunas={COLUNAS.length} /> : null}

            {!carregando &&
              eventos.map((evento) => (
                <tr key={evento.id_evento}>
                  <td data-label="Quando">
                    <time dateTime={evento.ocorrido_em}>
                      {formatarUltimoAcesso(new Date(evento.ocorrido_em).getTime())}
                    </time>
                  </td>
                  <td data-label="Categoria">
                    <span className="admin-tag">{evento.categoria_rotulo}</span>
                  </td>
                  <td data-label="Evento">
                    <span className="trilha__texto">{evento.tipo_rotulo || evento.tipo}</span>
                    {evento.motivo ? (
                      <span className="trilha__meta">{evento.motivo}</span>
                    ) : null}
                    {evento.detalhe?.alteracoes ? (
                      <span className="trilha__meta">
                        {itensAlterados(Object.keys(evento.detalhe.alteracoes).length)}
                      </span>
                    ) : null}
                  </td>
                  <td data-label="Quem">
                    <span className="trilha__texto">{nomeDoAtor(evento)}</span>
                    {evento.ator !== ATOR_SISTEMA && nomeDoAtor(evento) !== evento.ator ? (
                      <span className="trilha__meta">{evento.ator}</span>
                    ) : null}
                  </td>
                  <td data-label="Sobre">
                    {evento.alvo ? (
                      <>
                        <span
                          className={
                            evento.alvo.removido
                              ? 'trilha__texto trilha__alvo--removido'
                              : 'trilha__texto'
                          }
                        >
                          {evento.alvo.rotulo}
                        </span>
                        {evento.alvo.oportunidade ? (
                          <span className="trilha__meta">{evento.alvo.oportunidade}</span>
                        ) : null}
                      </>
                    ) : (
                      `${evento.entidade} ${evento.entidade_id}`
                    )}
                  </td>
                  <td data-label="Situação">
                    <span className={`status-badge status-badge--${evento.status}`}>
                      {evento.status_rotulo}
                    </span>
                  </td>
                </tr>
              ))}

            {!carregando && eventos.length === 0 ? (
              <tr>
                <td colSpan={COLUNAS.length}>
                  <TableEmpty
                    icon={appIcons.history}
                    title="Nenhum evento encontrado."
                    text={
                      temFiltro
                        ? 'Nenhum registro corresponde aos filtros aplicados.'
                        : 'A trilha começa a registrar no primeiro cadastro, acesso ou decisão.'
                    }
                    action={
                      temFiltro ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn--outline"
                          onClick={limpar}
                        >
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
    </section>
  )
}
