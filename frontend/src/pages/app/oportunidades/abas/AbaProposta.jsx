import { useCallback, useEffect, useState } from 'react'
import { AdminToast, useToast } from '../../../../components/console/toast'
import { useAuth } from '../../../../context/AuthContext'
import { Icone, appIcons } from '../../../../lib/icons'
import { ROLES } from '../../../../lib/roles'
import {
  atualizarProposta,
  criarProposta,
  obterProposta,
} from '../../../../services/pdConnectApi'
import ProximoPasso from './ProximoPasso'
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

function Campo({ campo, valor, onChange, erro }) {
  const { id, label, rows, requerido, isList, dica } = campo

  const aoDigitar = (event) => {
    const texto = event.target.value
    onChange(isList ? texto.split('\n') : texto)
  }

  const descritores = [`dica-${id}`, erro ? `erro-${id}` : null].filter(Boolean).join(' ')

  return (
    <div className="admin-field">
      <label htmlFor={id} className="admin-field__label">
        {label} {requerido ? <span aria-hidden="true">*</span> : null}
      </label>
      <span id={`dica-${id}`} className="admin-field__hint">
        {dica}
      </span>
      <textarea
        id={id}
        className="admin-input admin-input--area"
        rows={rows}
        value={isList ? (valor || []).join('\n') : valor || ''}
        onChange={aoDigitar}
        aria-invalid={Boolean(erro)}
        aria-describedby={descritores}
      />
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

export default function AbaProposta({ oportunidadeId, irPara, aoAlterar }) {
  const { user } = useAuth()
  const { toast, showToast } = useToast()

  const podeEditar = user?.role === ROLES.SUPERVISOR

  const [proposta, setProposta] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [naoIniciada, setNaoIniciada] = useState(false)
  const [erroCarga, setErroCarga] = useState('')
  const [iniciando, setIniciando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroValidacao, setErroValidacao] = useState({})
  const [alterado, setAlterado] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErroCarga('')
    setNaoIniciada(false)

    try {
      setProposta(await obterProposta(oportunidadeId))
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
              Esta oportunidade ainda não tem proposta.
            </p>
          </div>
        </header>

        <div className="perfil-card__body">
          <p className="oportunidade-page__vazio">
            {podeEditar
              ? 'O caminho mais rápido é pedir uma primeira versão ao Copiloto. Se preferir, comece a escrever aqui.'
              : 'O Supervisor ainda não começou a proposta desta oportunidade.'}
          </p>

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
            Os oito elementos que descrevem a pesquisa. Revise o texto, ajuste o
            que precisar e salve: salvar registra a sua revisão.
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
            Aguardando revisão
          </span>
        ) : null}
      </header>

      <div className="perfil-card__body proposta__corpo">
        {!revisada && temConteudo ? (
          <div className="admin-callout admin-callout--alerta" role="note">
            <Icone icon={appIcons.warning} className="admin-callout__icon" />
            <p className="admin-callout__text">
              O texto pode conter sugestões do Copiloto que ainda não foram
              revisadas. Leia cada elemento, ajuste o que precisar e salve.
            </p>
          </div>
        ) : null}

        {revisada && !alterado ? (
          <ProximoPasso etapa="competencias" irPara={irPara} />
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
          className="console-form"
          onSubmit={(evento) => {
            evento.preventDefault()
            salvar()
          }}
          noValidate
        >
          <fieldset className="proposta__campos" disabled={!podeEditar}>
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
                  />
                ))}
              </fieldset>
            ))}
          </fieldset>

          {podeEditar ? (
            <div className="proposta__rodape">
              <span className="proposta__estado" role="status">
                {alterado
                  ? 'Há alterações não salvas.'
                  : revisada
                    ? 'Tudo salvo.'
                    : temConteudo
                      ? 'Salve para registrar a sua revisão.'
                      : 'Preencha os elementos e salve.'}
              </span>
              <button
                type="submit"
                className="admin-btn"
                disabled={!podeSalvar || salvando}
              >
                <Icone icon={appIcons.save} />
                {salvando
                  ? 'Salvando...'
                  : alterado || revisada
                    ? 'Salvar proposta'
                    : 'Salvar como revisada'}
              </button>
            </div>
          ) : (
            <p className="proposta__legenda">
              <Icone icon={appIcons.view} /> Somente leitura: apenas o Supervisor edita a proposta.
            </p>
          )}
        </form>
      </div>

      <AdminToast toast={toast} />
    </section>
  )
}
