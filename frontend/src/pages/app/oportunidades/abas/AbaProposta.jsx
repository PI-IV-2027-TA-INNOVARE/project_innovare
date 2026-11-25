import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AdminToast, useToast } from '../../../../components/console/toast'
import { useAuth } from '../../../../context/AuthContext'
import { Icone, appIcons } from '../../../../lib/icons'
import { ROLES } from '../../../../lib/roles'
import {
  atualizarProposta,
  criarProposta,
  obterEstadoCopiloto,
  obterProposta,
} from '../../../../services/pdConnectApi'
import { situacaoEncerrada } from '../etapas'
import BarraDeAcoes, { ContinuarPara } from './BarraDeAcoes'
import EtapaEncerrada from './EtapaEncerrada'
import '../OportunidadesPage.scss'

const SECOES = [
  {
    titulo: 'O problema',
    campos: [
      {
        id: 'problema_pesquisa',
        label: 'Problema de pesquisa',
        rows: 4,
        requerido: true,
        dica: 'Qual é o problema a investigar e por que ele importa.',
      },
      {
        id: 'hipotese',
        label: 'Hipótese',
        rows: 3,
        requerido: false,
        dica: 'O que a pesquisa pretende comprovar. Deixe em branco se não se aplica.',
      },
    ],
  },
  {
    titulo: 'Os objetivos',
    campos: [
      {
        id: 'objetivo_geral',
        label: 'Objetivo geral',
        rows: 3,
        requerido: true,
        dica: 'Uma ou duas frases com o que a pesquisa quer alcançar.',
      },
      {
        id: 'objetivos_especificos',
        label: 'Objetivos específicos',
        rows: 4,
        requerido: true,
        isList: true,
        dica: 'Um por linha: os passos concretos que levam ao objetivo geral.',
      },
    ],
  },
  {
    titulo: 'Como será feito',
    campos: [
      {
        id: 'metodologia',
        label: 'Metodologia',
        rows: 5,
        requerido: true,
        dica: 'Métodos, ensaios e controles previstos, e como os resultados serão validados.',
      },
      {
        id: 'infraestrutura_recursos',
        label: 'Infraestrutura e recursos',
        rows: 4,
        requerido: true,
        dica: 'Laboratórios, equipamentos e materiais necessários, e o que já está disponível.',
      },
    ],
  },
  {
    titulo: 'O que se espera',
    campos: [
      {
        id: 'resultados_esperados',
        label: 'Resultados esperados',
        rows: 4,
        requerido: true,
        dica: 'O que a pesquisa entrega e como medir se deu certo.',
      },
      {
        id: 'caracterizacao_inovacao',
        label: 'Caracterização da inovação',
        rows: 4,
        requerido: true,
        dica: 'O que há de novo em relação às soluções que já existem.',
      },
    ],
  },
]

const CAMPOS_PROPOSTA = SECOES.flatMap((secao) => secao.campos)

const CODIGO_NAO_INICIADA = 'proposta_inexistente'

const LINHAS_RECOLHIDAS = 3

function Apontamento({ id, lacuna }) {
  return (
    <div
      id={id}
      className="admin-callout admin-callout--alerta proposta__apontamento"
      role="note"
    >
      <Icone icon={appIcons.warning} className="admin-callout__icon" />
      <div className="admin-callout__text">
        <p className="proposta__apontamento-cabeca">
          <span className={`copiloto__selo copiloto__selo--${lacuna.severidade}`}>
            {lacuna.severidade_rotulo || 'Lacuna'}
          </span>
          <span>
            Apontado pelo Copiloto na última análise
            {lacuna.natureza_rotulo ? ` · ${lacuna.natureza_rotulo}` : ''}
          </span>
        </p>
        <p className="copiloto__lacuna-descricao">{lacuna.descricao}</p>
        {lacuna.recomendacao ? (
          <p className="copiloto__lacuna-recomendacao">
            <span className="copiloto__lacuna-rotulo">O que fazer: </span>
            {lacuna.recomendacao}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function Campo({ campo, valor, onChange, erro, somenteLeitura, apontamento }) {
  const { id, label, rows, requerido, isList, dica } = campo
  const [focado, setFocado] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [transborda, setTransborda] = useState(false)
  const caixa = useRef(null)

  const texto = isList ? (valor || []).join('\n') : valor || ''
  const recolhido = !focado && !aberto && texto.trim() !== ''

  useLayoutEffect(() => {
    const elemento = caixa.current

    if (!elemento || !recolhido) return undefined

    const medir = () => setTransborda(elemento.scrollHeight > elemento.clientHeight + 1)

    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [recolhido, texto])

  useLayoutEffect(() => {
    const elemento = caixa.current

    if (!elemento) return

    if (!aberto) {
      elemento.style.height = ''
      return
    }

    elemento.style.height = 'auto'
    elemento.style.height = `${elemento.scrollHeight + elemento.offsetHeight - elemento.clientHeight}px`
  }, [aberto, texto])

  const aoDigitar = (event) => {
    const digitado = event.target.value
    onChange(isList ? digitado.split('\n') : digitado)
  }

  const descritores = [
    `dica-${id}`,
    apontamento ? `apontamento-${id}` : null,
    erro ? `erro-${id}` : null,
  ].filter(Boolean).join(' ')

  return (
    <div className="admin-field">
      <label htmlFor={id} className="admin-field__label">
        {label} {requerido ? <span aria-hidden="true">*</span> : null}
      </label>
      <span id={`dica-${id}`} className="admin-field__hint">
        {dica}
      </span>
      {apontamento ? <Apontamento id={`apontamento-${id}`} lacuna={apontamento} /> : null}
      <div className={`proposta__caixa${recolhido && transborda ? ' proposta__caixa--cortada' : ''}`}>
        <textarea
          ref={caixa}
          id={id}
          className={`admin-input admin-input--area${recolhido ? ' proposta__texto--recolhido' : ''}`}
          rows={recolhido ? LINHAS_RECOLHIDAS : rows}
          value={texto}
          onChange={aoDigitar}
          onFocus={() => setFocado(true)}
          onBlur={() => setFocado(false)}
          readOnly={somenteLeitura}
          aria-invalid={Boolean(erro)}
          aria-describedby={descritores}
        />
      </div>
      {transborda && (recolhido || aberto) ? (
        <button
          type="button"
          className="link-button proposta__ver-tudo"
          aria-expanded={aberto}
          aria-controls={id}
          onClick={() => setAberto((atual) => !atual)}
        >
          {aberto ? 'Recolher' : 'Ver texto completo'}{' '}
          <span className="sr-only">{aberto ? label : `de ${label}`}</span>
          <Icone icon={appIcons.disclosure} className="proposta__ver-tudo-icone" />
        </button>
      ) : null}
      {erro ? (
        <span id={`erro-${id}`} className="admin-field__error" role="alert">
          {erro}
        </span>
      ) : null}
    </div>
  )
}

function vazio(campo, valor) {
  return campo.isList
    ? !valor || valor.filter((linha) => linha.trim()).length === 0
    : !valor || String(valor).trim() === ''
}

function quandoFoiSalva(instante) {
  if (!instante) return 'Tudo salvo.'

  const data = new Date(instante)
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (data.toDateString() === new Date().toDateString()) return `Salvo às ${hora}.`

  const dia = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `Salvo em ${dia} às ${hora}.`
}

export default function AbaProposta({
  oportunidadeId,
  situacao,
  irPara,
  aoAlterar,
  aoSalvar,
  campoEmFoco,
  aoFocarCampo,
}) {
  const { user } = useAuth()
  const { toast, showToast } = useToast()

  const encerrada = situacaoEncerrada(situacao)
  const podeEditar = user?.role === ROLES.SUPERVISOR && !encerrada

  const [proposta, setProposta] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [naoIniciada, setNaoIniciada] = useState(false)
  const [erroCarga, setErroCarga] = useState('')
  const [iniciando, setIniciando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroValidacao, setErroValidacao] = useState({})
  const [alterado, setAlterado] = useState(false)
  const [apontamentos, setApontamentos] = useState([])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErroCarga('')
    setNaoIniciada(false)

    try {
      const [dados, copiloto] = await Promise.all([
        obterProposta(oportunidadeId),
        obterEstadoCopiloto(oportunidadeId).catch(() => null),
      ])

      setProposta(dados)
      setApontamentos(copiloto?.lacunas || [])
      setAlterado(false)
    } catch (falha) {
      if (falha?.data?.codigo === CODIGO_NAO_INICIADA) {
        setProposta(null)
        setNaoIniciada(true)
      } else {
        setErroCarga(falha?.message || 'Não foi possível carregar a proposta.')
      }
    } finally {
      setCarregando(false)
    }
  }, [oportunidadeId])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    aoAlterar?.(alterado)
  }, [alterado, aoAlterar])

  useEffect(() => () => aoAlterar?.(false), [aoAlterar])

  useEffect(() => {
    if (carregando || !campoEmFoco) return

    const campo = document.getElementById(campoEmFoco)

    if (campo) {
      campo.focus({ preventScroll: true })
      campo.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    }

    aoFocarCampo?.()
  }, [carregando, campoEmFoco, aoFocarCampo])

  useEffect(() => {
    if (!alterado) return undefined

    const avisar = (evento) => {
      evento.preventDefault()
      evento.returnValue = ''
    }

    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [alterado])

  const iniciar = async () => {
    setIniciando(true)

    try {
      setProposta(await criarProposta(oportunidadeId))
      setNaoIniciada(false)
      setAlterado(false)
      showToast('Proposta iniciada. Preencha os elementos e salve.')
    } catch (falha) {
      showToast(falha?.message || 'Não foi possível iniciar a proposta.', 'error')
    } finally {
      setIniciando(false)
    }
  }

  const alterarCampo = (id) => (valor) => {
    setProposta((atual) => ({ ...atual, [id]: valor }))
    setAlterado(true)

    if (erroValidacao[id]) {
      setErroValidacao((atual) => ({ ...atual, [id]: undefined }))
    }
  }

  const salvar = async () => {
    const erros = {}
    CAMPOS_PROPOSTA.forEach((campo) => {
      if (campo.requerido && vazio(campo, proposta?.[campo.id])) {
        erros[campo.id] = 'Preencha este elemento antes de salvar.'
      }
    })
    setErroValidacao(erros)

    if (Object.keys(erros).length > 0 || !proposta) return

    setSalvando(true)

    try {
      const payload = {}
      CAMPOS_PROPOSTA.forEach((campo) => {
        const valor = proposta[campo.id]
        payload[campo.id] = campo.isList
          ? (valor || []).map((linha) => linha.trim()).filter(Boolean)
          : valor || ''
      })

      setProposta(await atualizarProposta(oportunidadeId, payload))
      setAlterado(false)
      showToast('Proposta salva e marcada como revisada por você.')
      aoSalvar?.()
    } catch (falha) {
      showToast(falha?.message || 'Não foi possível salvar a proposta.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <section className="perfil-card">
        <p className="oportunidade-page__vazio" role="status">
          Carregando a proposta...
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

  if (naoIniciada) {
    return (
      <section className="perfil-card">
        <header className="perfil-card__header">
          <div>
            <h2 className="perfil-card__title">Proposta estruturada</h2>
            <p className="perfil-card__description">
              {encerrada
                ? 'Esta oportunidade não tem proposta.'
                : 'Esta oportunidade ainda não tem proposta.'}
            </p>
          </div>
        </header>

        <div className="perfil-card__body">
          <EtapaEncerrada situacao={situacao} irPara={irPara} />

          {encerrada ? null : (
            <p className="oportunidade-page__vazio">
              {podeEditar
                ? 'O caminho mais rápido é pedir uma primeira versão ao Copiloto. Se preferir, comece a escrever aqui.'
                : 'O Supervisor ainda não começou a proposta desta oportunidade.'}
            </p>
          )}

          {podeEditar ? (
            <div className="proposta__inicio">
              {irPara ? (
                <button type="button" className="admin-btn" onClick={() => irPara('copiloto')}>
                  <Icone icon={appIcons.compass} />
                  Ir para o Copiloto
                </button>
              ) : null}
              <button
                type="button"
                className="admin-btn admin-btn--outline"
                onClick={iniciar}
                disabled={iniciando}
              >
                <Icone icon={appIcons.edit} />
                {iniciando ? 'Iniciando...' : 'Iniciar proposta estruturada'}
              </button>
            </div>
          ) : null}
        </div>

        <AdminToast toast={toast} />
      </section>
    )
  }

  const temErro = Object.values(erroValidacao).some(Boolean)
  const temConteudo = CAMPOS_PROPOSTA.some((campo) => !vazio(campo, proposta[campo.id]))
  const revisada = Boolean(proposta.revisada_por_humano)
  const podeSalvar = alterado || (!revisada && temConteudo)

  return (
    <section className="perfil-card proposta">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">Proposta estruturada</h2>
          <p className="perfil-card__description">
            {podeEditar
              ? 'Os oito elementos que descrevem a pesquisa. Revise o texto, ajuste o que precisar e salve: salvar registra a sua revisão.'
              : 'Os oito elementos que descrevem a pesquisa.'}
          </p>
        </div>

        {revisada && proposta.revisor_nome ? (
          <span className="proposta__selo proposta__selo--ok">
            <Icone icon={appIcons.done} />
            <span>
              Revisada por <strong>{proposta.revisor_nome}</strong>
            </span>
          </span>
        ) : temConteudo ? (
          <span className="proposta__selo proposta__selo--pendente">
            <Icone icon={appIcons.warning} />
            {encerrada ? 'Não revisada' : 'Aguardando revisão'}
          </span>
        ) : null}
      </header>

      <div className="perfil-card__body proposta__corpo">
        <EtapaEncerrada situacao={situacao} irPara={irPara} />

        {!revisada && temConteudo ? (
          <div className="admin-callout admin-callout--alerta" role="note">
            <Icone icon={appIcons.warning} className="admin-callout__icon" />
            <p className="admin-callout__text">
              {podeEditar
                ? 'O texto pode conter sugestões do Copiloto que ainda não foram revisadas. Leia cada elemento, ajuste o que precisar e salve.'
                : encerrada
                  ? 'O texto pode conter sugestões do Copiloto que não foram revisadas antes da decisão.'
                  : 'O texto pode conter sugestões do Copiloto que ainda não foram revisadas pelo Supervisor.'}
            </p>
          </div>
        ) : null}

        {temErro ? (
          <div className="admin-callout admin-callout--alerta" role="alert">
            <Icone icon={appIcons.warning} className="admin-callout__icon" />
            <p className="admin-callout__text">
              Faltam elementos obrigatórios. Eles estão marcados abaixo.
            </p>
          </div>
        ) : null}

        {podeEditar ? (
          <p className="proposta__legenda">Elementos com * são obrigatórios.</p>
        ) : null}

        <form
          className="proposta__form"
          onSubmit={(evento) => {
            evento.preventDefault()
            salvar()
          }}
          noValidate
        >
          <p className="proposta__legenda">
            {podeEditar
              ? 'Textos longos aparecem recolhidos. Use “Ver texto completo” para ler tudo, ou clique no texto para editar.'
              : 'Textos longos aparecem recolhidos. Use “Ver texto completo” para ler tudo.'}
          </p>

          <fieldset className="proposta__campos">
            {SECOES.map((secao) => (
              <fieldset key={secao.titulo} className="proposta__secao">
                <legend className="proposta__secao-titulo">{secao.titulo}</legend>
                {secao.campos.map((campo) => (
                  <Campo
                    key={campo.id}
                    campo={campo}
                    valor={proposta[campo.id]}
                    onChange={alterarCampo(campo.id)}
                    erro={erroValidacao[campo.id]}
                    somenteLeitura={!podeEditar}
                    apontamento={apontamentos.find(
                      (lacuna) => lacuna.campo_afetado === campo.id,
                    )}
                  />
                ))}
              </fieldset>
            ))}
          </fieldset>

          {podeEditar ? (
            <BarraDeAcoes
              estado={
                alterado
                  ? 'Há alterações não salvas.'
                  : revisada
                    ? quandoFoiSalva(proposta.atualizado_em)
                    : temConteudo
                      ? 'Salve para registrar a sua revisão.'
                      : 'Preencha os elementos e salve.'
              }
            >
              <button
                type="submit"
                className={podeSalvar ? 'admin-btn' : 'admin-btn admin-btn--outline'}
                disabled={!podeSalvar || salvando}
              >
                <Icone icon={appIcons.save} />
                {salvando
                  ? 'Salvando...'
                  : alterado || revisada
                    ? 'Salvar proposta'
                    : 'Salvar como revisada'}
              </button>
              {revisada && !alterado ? <ContinuarPara etapa="competencias" irPara={irPara} /> : null}
            </BarraDeAcoes>
          ) : (
            <p className="proposta__legenda">
              <Icone icon={appIcons.view} />{' '}
              {encerrada
                ? 'Somente leitura: a proposta fica como estava na decisão.'
                : 'Somente leitura: apenas o Supervisor edita a proposta.'}
            </p>
          )}
        </form>
      </div>

      <AdminToast toast={toast} />
    </section>
  )
}
