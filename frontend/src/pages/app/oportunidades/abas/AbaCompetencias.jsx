import { useCallback, useEffect, useState } from 'react'
import { AdminToast, useToast } from '../../../../components/console/toast'
import { useAuth } from '../../../../context/AuthContext'
import { LIMITES_DE_GASTO, explicarMotivoSemIa } from '../../../../lib/glossario'
import { Icone, appIcons } from '../../../../lib/icons'
import { ROLES } from '../../../../lib/roles'
import {
  adicionarCompetencia,
  atualizarCompetencia,
  derivarCompetencias,
  listarCompetencias,
  removerCompetencia,
} from '../../../../services/pdConnectApi'
import EsperaIA from './EsperaIA'
import AvisoPropostaNaoRevisada from './AvisoPropostaNaoRevisada'
import ProximoPasso from './ProximoPasso'
import '../OportunidadesPage.scss'

const CODIGO_SEM_PROPOSTA = 'proposta_inexistente'

const plural = (total, singular, varios) => `${total} ${total === 1 ? singular : varios}`

const NIVEIS = [
  { valor: 'essencial', rotulo: 'Essencial' },
  { valor: 'desejavel', rotulo: 'Desejável' },
]

function Linha({ competencia, podeEditar, onSalvar, onRemover, ocupado }) {
  const [editando, setEditando] = useState(false)
  const [descricao, setDescricao] = useState(competencia.descricao)
  const [nivel, setNivel] = useState(competencia.nivel_importancia)

  const salvar = async () => {
    await onSalvar(competencia, { descricao: descricao.trim(), nivel_importancia: nivel })
    setEditando(false)
  }

  if (editando) {
    return (
      <li className="competencias__item competencias__item--editando">
        <input
          className="admin-input"
          value={descricao}
          onChange={(evento) => setDescricao(evento.target.value)}
          aria-label="Descrição da competência"
        />
        <select
          className="admin-input"
          value={nivel}
          onChange={(evento) => setNivel(evento.target.value)}
          aria-label="Nível de importância"
        >
          {NIVEIS.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
        <div className="competencias__acoes">
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            onClick={salvar}
            disabled={!descricao.trim() || ocupado}
          >
            Salvar
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--sm admin-btn--outline"
            onClick={() => setEditando(false)}
          >
            Cancelar
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="competencias__item">
      <div className="competencias__descricao">
        <p className="competencias__texto">{competencia.descricao}</p>
        <p className="competencias__meta">
          {competencia.nivel_rotulo} · {competencia.derivada_rotulo}
          {competencia.no_vocabulario ? ' · já cadastrada na rede interna' : ''}
        </p>
      </div>

      {podeEditar ? (
        <div className="competencias__acoes">
          <button
            type="button"
            className="admin-btn admin-btn--sm admin-btn--outline"
            onClick={() => setEditando(true)}
          >
            <Icone icon={appIcons.edit} />
            Editar
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--sm admin-btn--outline"
            onClick={() => onRemover(competencia)}
            disabled={ocupado}
          >
            <Icone icon={appIcons.remove} />
            Remover
          </button>
        </div>
      ) : null}
    </li>
  )
}

export default function AbaCompetencias({ oportunidadeId, aoMudar, aoOcupar, irPara }) {
  const { user } = useAuth()
  const { toast, showToast } = useToast()

  const podeEditar = user?.role === ROLES.SUPERVISOR

  const [competencias, setCompetencias] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [semProposta, setSemProposta] = useState(false)
  const [erroCarga, setErroCarga] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [derivando, setDerivando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [nova, setNova] = useState({ descricao: '', nivel_importancia: 'essencial' })

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCarregando(true)
    setErroCarga('')
    setSemProposta(false)

    try {
      setCompetencias(await listarCompetencias(oportunidadeId))
    } catch (falha) {
      if (falha?.data?.codigo === CODIGO_SEM_PROPOSTA) {
        setSemProposta(true)
        setCompetencias([])
      } else {
        setErroCarga(falha?.message || 'Não foi possível carregar as competências.')
      }
    } finally {
      setCarregando(false)
    }
  }, [oportunidadeId])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    aoOcupar?.(derivando)
  }, [derivando, aoOcupar])

  useEffect(() => () => aoOcupar?.(false), [aoOcupar])

  const executar = async (acao, mensagem) => {
    setOcupado(true)

    try {
      const resultado = await acao()
      await carregar({ silencioso: true })
      aoMudar?.()
      if (mensagem) showToast(mensagem)
      return resultado
    } catch (falha) {
      showToast(falha?.message || 'A operação não foi concluída.', 'error')
      return null
    } finally {
      setOcupado(false)
    }
  }

  const [propostaPendente, setPropostaPendente] = useState(false)

  const derivar = async () => {
    setDerivando(true)
    setAviso(null)

    const resultado = await executar(() => derivarCompetencias(oportunidadeId))

    setDerivando(false)

    if (!resultado) return

    if (resultado.fallback_usado && LIMITES_DE_GASTO.includes(resultado.motivo_fallback)) {
      setAviso({
        tom: 'alerta',
        texto: `A IA não foi chamada: ${explicarMotivoSemIa(resultado.motivo_fallback)}. Acrescente as competências manualmente abaixo.`,
      })
    } else if (resultado.fallback_usado) {
      setAviso({
        tom: 'alerta',
        texto: 'A IA não respondeu e nenhuma competência foi derivada. Tente de novo em alguns minutos ou acrescente as competências manualmente abaixo.',
      })
    } else if (resultado.criadas.length === 0) {
      setAviso({
        tom: 'info',
        texto: 'Nenhuma competência nova foi encontrada: as que a proposta pede já estão na lista.',
      })
    } else {
      setAviso({
        tom: 'info',
        texto: `${plural(resultado.criadas.length, 'competência sugerida', 'competências sugeridas')} pela IA. Revise a lista: edite, remova ou ajuste o nível de importância.`,
      })
    }
  }

  const acrescentar = async (evento) => {
    evento.preventDefault()

    if (!nova.descricao.trim()) return

    await executar(
      () =>
        adicionarCompetencia(oportunidadeId, {
          descricao: nova.descricao.trim(),
          nivel_importancia: nova.nivel_importancia,
        }),
      'Competência acrescentada.',
    )
    setNova({ descricao: '', nivel_importancia: 'essencial' })
  }

  const salvar = (competencia, dados) =>
    executar(
      () =>
        atualizarCompetencia(
          oportunidadeId,
          competencia.id_competencia_necessaria,
          dados,
        ),
      'Competência revisada.',
    )

  const remover = (competencia) =>
    executar(
      () =>
        removerCompetencia(oportunidadeId, competencia.id_competencia_necessaria),
      'Competência removida.',
    )

  if (carregando) {
    return (
      <section className="perfil-card">
        <p className="oportunidade-page__vazio" role="status">
          Carregando as competências...
        </p>
      </section>
    )
  }

  if (erroCarga) {
    return (
      <section className="perfil-card">
        <p className="oportunidade-page__vazio">{erroCarga}</p>
        <button type="button" className="admin-btn admin-btn--outline" onClick={carregar}>
          Tentar de novo
        </button>
      </section>
    )
  }

  if (semProposta) {
    return (
      <section className="perfil-card">
        <header className="perfil-card__header">
          <div>
            <h2 className="perfil-card__title">Competências necessárias</h2>
            <p className="perfil-card__description">
              As competências são derivadas da proposta estruturada.
            </p>
          </div>
        </header>

        <div className="perfil-card__body">
          <p className="oportunidade-page__vazio">
            Esta oportunidade ainda não tem proposta estruturada.
          </p>
          {podeEditar ? (
            <ProximoPasso
              etapa="copiloto"
              irPara={irPara}
              texto="Comece pela proposta: peça uma primeira versão ao Copiloto e revise o texto."
            />
          ) : null}
        </div>
      </section>
    )
  }

  const essenciais = competencias.filter(
    (item) => item.nivel_importancia === 'essencial',
  ).length

  return (
    <section className="perfil-card competencias">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">Competências necessárias</h2>
          <p className="perfil-card__description">
            O que é preciso saber para executar esta oportunidade. É sobre esta
            lista que o matching compara a rede interna.
          </p>
          <p className="competencias__contagem">
            {plural(competencias.length, 'competência', 'competências')} ·{' '}
            {plural(essenciais, 'essencial', 'essenciais')}
          </p>
        </div>

        {podeEditar ? (
          <button
            type="button"
            className="admin-btn"
            onClick={derivar}
            disabled={ocupado || propostaPendente}
          >
            <Icone icon={appIcons.flow} />
            {derivando ? 'Derivando...' : 'Derivar da proposta'}
          </button>
        ) : (
          <span
            className="perfil-card__lock"
            title="Apenas o Supervisor edita as competências."
          >
            <Icone icon={appIcons.view} />
            Somente leitura
          </span>
        )}
      </header>

      <div className="perfil-card__body competencias__corpo">
        <AvisoPropostaNaoRevisada
          oportunidadeId={oportunidadeId}
          irPara={irPara}
          aoVerificar={setPropostaPendente}
        />

        {derivando ? (
          <EsperaIA titulo="A IA está lendo a proposta para identificar as competências." />
        ) : null}

        {aviso ? (
          <div
            className={`admin-callout${aviso.tom === 'alerta' ? ' admin-callout--alerta' : ''}`}
            role="status"
          >
            <Icone
              icon={aviso.tom === 'alerta' ? appIcons.warning : appIcons.info}
              className="admin-callout__icon"
            />
            <p className="admin-callout__text">{aviso.texto}</p>
          </div>
        ) : null}

        {competencias.length === 0 ? (
          <p className="oportunidade-page__vazio">
            {podeEditar
              ? 'Nenhuma competência registrada. Clique em Derivar da proposta para a IA sugerir a lista, ou acrescente manualmente abaixo.'
              : 'Nenhuma competência registrada ainda.'}
          </p>
        ) : (
          <ul className="competencias__lista">
            {competencias.map((competencia) => (
              <Linha
                key={competencia.id_competencia_necessaria}
                competencia={competencia}
                podeEditar={podeEditar}
                onSalvar={salvar}
                onRemover={remover}
                ocupado={ocupado}
              />
            ))}
          </ul>
        )}

        {podeEditar ? (
          <form className="competencias__forma" onSubmit={acrescentar}>
            <label className="admin-field">
              <span className="admin-field__label">Acrescentar competência</span>
              <input
                className="admin-input"
                value={nova.descricao}
                onChange={(evento) =>
                  setNova((atual) => ({ ...atual, descricao: evento.target.value }))
                }
                placeholder="Ex.: Microbiologia de alimentos"
              />
            </label>

            <label className="admin-field">
              <span className="admin-field__label">Nível</span>
              <select
                className="admin-input"
                value={nova.nivel_importancia}
                onChange={(evento) =>
                  setNova((atual) => ({
                    ...atual,
                    nivel_importancia: evento.target.value,
                  }))
                }
              >
                {NIVEIS.map((opcao) => (
                  <option key={opcao.valor} value={opcao.valor}>
                    {opcao.rotulo}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="admin-btn admin-btn--outline"
              disabled={!nova.descricao.trim() || ocupado || propostaPendente}
            >
              <Icone icon={appIcons.addUser} />
              Acrescentar
            </button>
          </form>
        ) : null}

        {podeEditar && essenciais > 0 ? (
          <ProximoPasso etapa="equipe" irPara={irPara} />
        ) : null}
      </div>

      <AdminToast toast={toast} />
    </section>
  )
}
