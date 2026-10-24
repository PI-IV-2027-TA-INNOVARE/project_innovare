import { useCallback, useEffect, useState } from 'react'
import { AdminToast, useToast } from '../../../../components/console/toast'
import { useAuth } from '../../../../context/AuthContext'
import { Icone, appIcons } from '../../../../lib/icons'
import { ROLES } from '../../../../lib/roles'
import {
  concluirSessaoCopiloto,
  estruturarComCopiloto,
  iniciarSessaoCopiloto,
  obterEstadoCopiloto,
  responderCopiloto,
} from '../../../../services/pdConnectApi'
import EsperaIA from './EsperaIA'
import ProximoPasso from './ProximoPasso'
import '../OportunidadesPage.scss'

const ROTULOS_DOS_ELEMENTOS = {
  problema_pesquisa: 'Problema de pesquisa',
  hipotese: 'Hipótese',
  objetivo_geral: 'Objetivo geral',
  objetivos_especificos: 'Objetivos específicos',
  metodologia: 'Metodologia',
  resultados_esperados: 'Resultados esperados',
  caracterizacao_inovacao: 'Caracterização da inovação',
  infraestrutura_recursos: 'Infraestrutura e recursos',
}

const TOTAL_DE_ELEMENTOS = Object.keys(ROTULOS_DOS_ELEMENTOS).length

const rotuloDoElemento = (elemento) => ROTULOS_DOS_ELEMENTOS[elemento] || elemento

function agruparPorElemento(perguntas) {
  const grupos = []

  perguntas.forEach((pergunta) => {
    const grupo = grupos.find((item) => item.elemento === pergunta.elemento)

    if (grupo) {
      grupo.perguntas.push(pergunta)
    } else {
      grupos.push({ elemento: pergunta.elemento, perguntas: [pergunta] })
    }
  })

  return grupos
}

function Progresso({ preenchidos }) {
  return (
    <div className="copiloto__progresso">
      <p className="copiloto__contagem">
        {preenchidos} de {TOTAL_DE_ELEMENTOS} elementos preenchidos
      </p>
      <div
        className="copiloto__barra"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={TOTAL_DE_ELEMENTOS}
        aria-valuenow={preenchidos}
        aria-label="Elementos da proposta preenchidos"
      >
        <span style={{ width: `${(preenchidos / TOTAL_DE_ELEMENTOS) * 100}%` }} />
      </div>
    </div>
  )
}

function Pendencias({ pendentes, lacunas }) {
  if (pendentes.length === 0) return null

  return (
    <div className="copiloto__bloco">
      <h3 className="copiloto__subtitulo">O que ainda falta na proposta</h3>

      {lacunas.length > 0 ? (
        <ul className="copiloto__lista-lacunas">
          {lacunas.map((lacuna) => (
            <li key={lacuna.id_lacuna} className="copiloto__lacuna">
              <span className={`copiloto__selo copiloto__selo--${lacuna.severidade}`}>
                {lacuna.severidade_rotulo || 'Lacuna'}
              </span>
              <div>
                <p className="copiloto__lacuna-descricao">{lacuna.descricao}</p>
                {lacuna.recomendacao ? (
                  <p className="copiloto__lacuna-recomendacao">{lacuna.recomendacao}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="copiloto__pendentes">
          {pendentes.map((elemento) => (
            <li key={elemento} className="copiloto__pendente">
              {rotuloDoElemento(elemento)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Perguntas({ perguntas, baseDisponivel }) {
  if (!baseDisponivel) {
    return (
      <p className="copiloto__nota" role="status">
        As perguntas orientadoras não estão disponíveis no momento. Você ainda
        pode pedir a estruturação: o Copiloto usa a descrição da oportunidade.
      </p>
    )
  }

  if (perguntas.length === 0) {
    return (
      <p className="copiloto__nota">
        Não há pergunta pendente para os elementos que faltam.
      </p>
    )
  }

  return (
    <div className="copiloto__grupos">
      {agruparPorElemento(perguntas).map((grupo) => (
        <section key={grupo.elemento} className="copiloto__grupo">
          <h4 className="copiloto__grupo-titulo">{rotuloDoElemento(grupo.elemento)}</h4>
          <ul className="copiloto__perguntas">
            {grupo.perguntas.map((pergunta) => (
              <li key={`${pergunta.id}-${pergunta.elemento}`} className="copiloto__pergunta">
                <p className="copiloto__pergunta-texto">{pergunta.pergunta}</p>
                {pergunta.motivo ? (
                  <p className="copiloto__pergunta-motivo">{pergunta.motivo}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Conversa({ mensagens }) {
  if (mensagens.length === 0) return null

  return (
    <ul className="copiloto__conversa">
      {mensagens.map((mensagem) => (
        <li
          key={mensagem.id_mensagem}
          className={`copiloto__fala copiloto__fala--${mensagem.autor}`}
        >
          <span className="copiloto__autor">{mensagem.autor_rotulo}</span>
          <p className="copiloto__conteudo">{mensagem.conteudo}</p>
        </li>
      ))}
    </ul>
  )
}

function Resultado({ resultado, irPara }) {
  if (!resultado) return null

  if (resultado.indisponivel) {
    return (
      <div className="admin-callout admin-callout--alerta" role="alert">
        <Icone icon={appIcons.warning} className="admin-callout__icon" />
        <p className="admin-callout__text">
          O Copiloto não respondeu e nada foi preenchido. Tente de novo em alguns
          minutos ou escreva direto na aba Proposta estruturada.
        </p>
      </div>
    )
  }

  if (resultado.preenchidos.length === 0) {
    return (
      <div className="admin-callout" role="status">
        <Icone icon={appIcons.info} className="admin-callout__icon" />
        <p className="admin-callout__text">
          O Copiloto não encontrou informação suficiente para preencher novos
          elementos. Responda as perguntas abaixo e tente de novo.
        </p>
      </div>
    )
  }

  return (
    <ProximoPasso
      etapa="proposta"
      irPara={irPara}
      rotulo="Revisar a proposta"
      texto={`O Copiloto preencheu ${resultado.preenchidos.map(rotuloDoElemento).join(', ')}. Leia, ajuste o que precisar e salve na aba Proposta estruturada.`}
    />
  )
}

export default function AbaCopiloto({ oportunidadeId, aoEstruturar, aoOcupar, irPara }) {
  const { user } = useAuth()
  const { toast, showToast } = useToast()

  const podeConduzir = user?.role === ROLES.SUPERVISOR

  const [estado, setEstado] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [resposta, setResposta] = useState('')
  const [emAcao, setEmAcao] = useState('')
  const [resultado, setResultado] = useState(null)

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCarregando(true)
    setErroCarga('')

    try {
      setEstado(await obterEstadoCopiloto(oportunidadeId))
    } catch (falha) {
      if (!silencioso) {
        setErroCarga(falha?.message || 'Não foi possível carregar o Copiloto.')
      }
    } finally {
      setCarregando(false)
    }
  }, [oportunidadeId])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    aoOcupar?.(emAcao === 'estruturar')
  }, [emAcao, aoOcupar])

  useEffect(() => () => aoOcupar?.(false), [aoOcupar])

  const estruturar = async () => {
    setEmAcao('estruturar')
    setResultado(null)

    try {
      const saida = await estruturarComCopiloto(oportunidadeId)
      setResultado({
        indisponivel: Boolean(saida.fallback_usado) && saida.preenchidos.length === 0,
        preenchidos: saida.preenchidos || [],
      })
      await carregar({ silencioso: true })
      aoEstruturar?.()
    } catch (falha) {
      showToast(falha?.message || 'A estruturação não foi concluída.', 'error')
    } finally {
      setEmAcao('')
    }
  }

  const enviarResposta = async (event) => {
    event.preventDefault()

    const texto = resposta.trim()
    if (!texto) return

    setEmAcao('responder')

    try {
      if (!estado?.sessao) {
        await iniciarSessaoCopiloto(oportunidadeId)
      }
      await responderCopiloto(oportunidadeId, texto)
      setResposta('')
      await carregar({ silencioso: true })
      showToast('Resposta registrada. Ela entra na próxima estruturação.')
    } catch (falha) {
      showToast(falha?.message || 'A resposta não foi registrada.', 'error')
    } finally {
      setEmAcao('')
    }
  }

  const encerrar = async () => {
    setEmAcao('encerrar')

    try {
      await concluirSessaoCopiloto(oportunidadeId)
      await carregar({ silencioso: true })
      showToast('Conversa encerrada. A proposta continua editável.')
    } catch (falha) {
      showToast(falha?.message || 'A conversa não foi encerrada.', 'error')
    } finally {
      setEmAcao('')
    }
  }

  if (carregando) {
    return (
      <section className="perfil-card">
        <p className="oportunidade-page__vazio" role="status">
          Carregando o Copiloto...
        </p>
      </section>
    )
  }

  if (erroCarga) {
    return (
      <section className="perfil-card">
        <p className="oportunidade-page__vazio">{erroCarga}</p>
        <button
          type="button"
          className="admin-btn admin-btn--outline"
          onClick={() => carregar()}
        >
          Tentar de novo
        </button>
      </section>
    )
  }

  const sessao = estado?.sessao || null
  const pendentes = estado?.elementos_vazios || []
  const preenchidos = TOTAL_DE_ELEMENTOS - pendentes.length
  const completa = pendentes.length === 0
  const ocupado = Boolean(emAcao)

  return (
    <section className="perfil-card copiloto">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">Copiloto de Estruturação</h2>
          <p className="perfil-card__description">
            O Copiloto lê a descrição da oportunidade e as suas respostas e
            escreve uma primeira versão dos elementos que ainda estão vazios. O
            que você já escreveu não é alterado.
          </p>
          <Progresso preenchidos={preenchidos} />
        </div>

        {podeConduzir ? (
          <button
            type="button"
            className="admin-btn"
            onClick={estruturar}
            disabled={ocupado || completa}
            title={completa ? 'Todos os elementos já têm conteúdo.' : undefined}
          >
            <Icone icon={appIcons.flow} />
            {emAcao === 'estruturar'
              ? 'Estruturando...'
              : preenchidos === 0
                ? 'Estruturar com o Copiloto'
                : 'Estruturar o que falta'}
          </button>
        ) : (
          <span
            className="perfil-card__lock"
            title="Conduzir a estruturação é do Supervisor."
          >
            <Icone icon={appIcons.view} />
            Somente leitura
          </span>
        )}
      </header>

      <div className="perfil-card__body copiloto__corpo">
        <div className="admin-callout" role="note">
          <Icone icon={appIcons.info} className="admin-callout__icon" />
          <p className="admin-callout__text">
            Tudo o que o Copiloto escreve é sugestão e precisa de revisão humana
            antes de valer como proposta.
          </p>
        </div>

        {emAcao === 'estruturar' ? (
          <EsperaIA titulo="O Copiloto está escrevendo os elementos que faltam." />
        ) : null}

        <Resultado resultado={resultado} irPara={irPara} />

        {completa && !resultado ? (
          <ProximoPasso
            etapa="proposta"
            irPara={irPara}
            rotulo="Revisar a proposta"
            texto="Os oito elementos já têm conteúdo. Revise o texto na aba Proposta estruturada antes de seguir."
          />
        ) : null}

        {podeConduzir && !completa ? (
          <ol className="copiloto__como">
            <li>Responda as perguntas abaixo. Quanto mais contexto, melhor o resultado.</li>
            <li>Clique em <strong>Estruturar</strong>. O Copiloto preenche o que falta.</li>
            <li>Revise e salve o texto na aba Proposta estruturada.</li>
          </ol>
        ) : null}

        <Pendencias pendentes={pendentes} lacunas={estado?.lacunas || []} />

        {!completa ? (
          <div className="copiloto__bloco">
            <h3 className="copiloto__subtitulo">Perguntas orientadoras</h3>
            <Perguntas
              perguntas={estado?.perguntas || []}
              baseDisponivel={Boolean(estado?.base_disponivel)}
            />

            {podeConduzir ? (
              <form className="copiloto__forma" onSubmit={enviarResposta}>
                <label className="admin-field">
                  <span className="admin-field__label">Sua resposta</span>
                  <textarea
                    className="admin-input admin-input--area"
                    rows={4}
                    value={resposta}
                    onChange={(event) => setResposta(event.target.value)}
                    placeholder="Responda uma ou mais perguntas. Ex.: a perda média é de 4% do lote."
                  />
                  <span className="admin-field__hint">
                    A resposta não altera a proposta; ela é usada na próxima estruturação.
                  </span>
                </label>

                <button
                  type="submit"
                  className="admin-btn admin-btn--outline"
                  disabled={!resposta.trim() || ocupado}
                >
                  <Icone icon={appIcons.save} />
                  {emAcao === 'responder' ? 'Registrando...' : 'Registrar resposta'}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

        {(estado?.mensagens || []).length > 0 ? (
          <div className="copiloto__bloco">
            <div className="copiloto__bloco-cabeca">
              <h3 className="copiloto__subtitulo">Histórico da conversa</h3>
              {podeConduzir && sessao ? (
                <button
                  type="button"
                  className="admin-btn admin-btn--sm admin-btn--outline"
                  onClick={encerrar}
                  disabled={ocupado}
                >
                  <Icone icon={appIcons.done} />
                  {emAcao === 'encerrar' ? 'Encerrando...' : 'Encerrar conversa'}
                </button>
              ) : null}
            </div>
            <Conversa mensagens={estado.mensagens} />
          </div>
        ) : null}
      </div>

      <AdminToast toast={toast} />
    </section>
  )
}
