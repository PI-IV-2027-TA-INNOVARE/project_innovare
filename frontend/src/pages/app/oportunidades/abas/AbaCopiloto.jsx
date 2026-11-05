import { useCallback, useEffect, useState } from 'react'
import { AdminToast, useToast } from '../../../../components/console/toast'
import { useAuth } from '../../../../context/AuthContext'
import { LIMITES_DE_GASTO, explicarMotivoSemIa } from '../../../../lib/glossario'
import { Icone, appIcons } from '../../../../lib/icons'
import { ROLES } from '../../../../lib/roles'
import {
  aceitarSugestaoCopiloto,
  atualizarSinteseCopiloto,
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

const ACOES_COM_IA = ['ler', 'responder', 'estruturar']

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

function ResumoDaEntrada({ sessao, podeConduzir, ocupado, aoLer, aoSalvar }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')

  if (!sessao) {
    if (!podeConduzir) return null

    return (
      <div className="copiloto__bloco copiloto__resumo">
        <h3 className="copiloto__subtitulo">Resumo da entrada</h3>
        <p className="copiloto__nota">
          Comece por aqui: o Copiloto lê a descrição da oportunidade e resume o
          problema, o contexto e o que falta. Você corrige o que não estiver certo.
        </p>
        <button
          type="button"
          className="admin-btn admin-btn--outline"
          onClick={aoLer}
          disabled={ocupado}
        >
          <Icone icon={appIcons.view} />
          Ler a entrada
        </button>
      </div>
    )
  }

  const abrirEdicao = () => {
    setTexto(sessao.sintese || '')
    setEditando(true)
  }

  const salvar = async (event) => {
    event.preventDefault()

    if (await aoSalvar(texto.trim())) setEditando(false)
  }

  return (
    <div className="copiloto__bloco copiloto__resumo">
      <div className="copiloto__bloco-cabeca">
        <h3 className="copiloto__subtitulo">Resumo da entrada</h3>
        {podeConduzir && !editando ? (
          <button
            type="button"
            className="admin-btn admin-btn--sm admin-btn--outline"
            onClick={abrirEdicao}
            disabled={ocupado}
          >
            <Icone icon={appIcons.edit} />
            Corrigir o resumo
          </button>
        ) : null}
      </div>

      {editando ? (
        <form className="copiloto__resumo-forma" onSubmit={salvar}>
          <label className="admin-field">
            <span className="admin-field__label">Resumo da entrada</span>
            <textarea
              className="admin-input admin-input--area"
              rows={6}
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
            />
            <span className="admin-field__hint">
              O Copiloto usa este resumo para escrever a proposta.
            </span>
          </label>
          <div className="copiloto__acoes">
            <button type="submit" className="admin-btn admin-btn--sm" disabled={ocupado}>
              <Icone icon={appIcons.save} />
              Salvar o resumo
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--sm admin-btn--outline"
              onClick={() => setEditando(false)}
              disabled={ocupado}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : sessao.sintese ? (
        <p className="copiloto__resumo-texto">{sessao.sintese}</p>
      ) : (
        <p className="copiloto__nota">
          Ainda não há resumo. {podeConduzir ? 'Se quiser, escreva o problema, o contexto e o que falta.' : ''}
        </p>
      )}
    </div>
  )
}

function Lacunas({ pendentes, lacunas }) {
  if (pendentes.length === 0 && lacunas.length === 0) return null

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
                <p className="copiloto__lacuna-cabeca">
                  {rotuloDoElemento(lacuna.campo_afetado)}
                  {lacuna.natureza_rotulo ? ` · ${lacuna.natureza_rotulo}` : ''}
                </p>
                <p className="copiloto__lacuna-descricao">{lacuna.descricao}</p>
                {lacuna.recomendacao ? (
                  <p className="copiloto__lacuna-recomendacao">
                    <span className="copiloto__lacuna-rotulo">O que fazer: </span>
                    {lacuna.recomendacao}
                  </p>
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

function Perguntas({ perguntas, baseDisponivel, podeConduzir, ocupado, aoEscolher }) {
  return (
    <>
      {!baseDisponivel ? (
        <p className="copiloto__nota" role="status">
          As perguntas orientadoras não estão disponíveis no momento. Você ainda
          pode pedir a estruturação: o Copiloto usa a descrição da oportunidade.
        </p>
      ) : null}

      {baseDisponivel && perguntas.length === 0 ? (
        <p className="copiloto__nota">
          Não há pergunta pendente para os elementos que faltam.
        </p>
      ) : null}

      {perguntas.length > 0 ? (
        <div className="copiloto__grupos">
          {agruparPorElemento(perguntas).map((grupo) => (
            <section key={grupo.elemento} className="copiloto__grupo">
              <h4 className="copiloto__grupo-titulo">{rotuloDoElemento(grupo.elemento)}</h4>
              <ul className="copiloto__perguntas">
                {grupo.perguntas.map((pergunta) => (
                  <li key={`${pergunta.id}-${pergunta.elemento}`} className="copiloto__pergunta">
                    <div>
                      {pergunta.origem === 'copiloto' ? (
                        <span className="copiloto__origem">Pergunta do Copiloto</span>
                      ) : null}
                      <p className="copiloto__pergunta-texto">{pergunta.pergunta}</p>
                      {pergunta.motivo ? (
                        <p className="copiloto__pergunta-motivo">{pergunta.motivo}</p>
                      ) : null}
                    </div>
                    {podeConduzir ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn--sm admin-btn--outline"
                        onClick={() => aoEscolher(pergunta)}
                        disabled={ocupado}
                      >
                        Responder
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </>
  )
}

function Sugestoes({ sugestoes, podeConduzir, ocupado, aoAceitar, aoRecusar }) {
  if (sugestoes.length === 0) return null

  return (
    <div className="copiloto__bloco">
      <h3 className="copiloto__subtitulo">Sugestões para o que já está escrito</h3>
      <p className="copiloto__nota">Nada muda na proposta até você aceitar.</p>

      <ul className="copiloto__sugestoes">
        {sugestoes.map((sugestao) => (
          <li key={sugestao.elemento} className="copiloto__sugestao">
            <h4 className="copiloto__grupo-titulo">
              {sugestao.elemento_rotulo || rotuloDoElemento(sugestao.elemento)}
            </h4>
            {sugestao.motivo ? (
              <p className="copiloto__pergunta-motivo">{sugestao.motivo}</p>
            ) : null}
            <p className="copiloto__sugestao-texto">{sugestao.texto_sugerido}</p>

            {podeConduzir ? (
              <div className="copiloto__acoes">
                <button
                  type="button"
                  className="admin-btn admin-btn--sm"
                  onClick={() => aoAceitar(sugestao)}
                  disabled={ocupado}
                >
                  <Icone icon={appIcons.done} />
                  Aceitar
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--sm admin-btn--outline"
                  onClick={() => aoRecusar(sugestao)}
                  disabled={ocupado}
                >
                  <Icone icon={appIcons.clear} />
                  Recusar
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
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

  if (resultado.indisponivel && LIMITES_DE_GASTO.includes(resultado.motivo)) {
    return (
      <div className="admin-callout admin-callout--alerta" role="alert">
        <Icone icon={appIcons.warning} className="admin-callout__icon" />
        <p className="admin-callout__text">
          O Copiloto não foi chamado: {explicarMotivoSemIa(resultado.motivo)}. Escreva
          direto na aba Proposta estruturada.
        </p>
      </div>
    )
  }

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
    let texto = 'O Copiloto não encontrou informação suficiente para preencher novos elementos. Responda as perguntas abaixo e tente de novo.'

    if (resultado.sugeriu) {
      texto = 'O Copiloto não preencheu elementos novos. Veja abaixo o que ele sugere mudar no que já está escrito.'
    } else if (resultado.completa) {
      texto = 'A proposta foi reavaliada e o Copiloto não sugeriu mudanças. Confira as lacunas abaixo, se houver.'
    }

    return (
      <div className="admin-callout" role="status">
        <Icone icon={appIcons.info} className="admin-callout__icon" />
        <p className="admin-callout__text">{texto}</p>
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
  const [escolhida, setEscolhida] = useState(null)
  const [emAcao, setEmAcao] = useState('')
  const [resultado, setResultado] = useState(null)
  const [sugestoes, setSugestoes] = useState([])

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
    aoOcupar?.(ACOES_COM_IA.includes(emAcao))
  }, [emAcao, aoOcupar])

  useEffect(() => () => aoOcupar?.(false), [aoOcupar])

  const estruturar = async () => {
    setEmAcao('estruturar')
    setResultado(null)
    setSugestoes([])

    try {
      const saida = await estruturarComCopiloto(oportunidadeId)
      const novas = saida.sugestoes || []

      setResultado({
        indisponivel: Boolean(saida.fallback_usado) && (saida.preenchidos || []).length === 0,
        motivo: saida.motivo_fallback || null,
        preenchidos: saida.preenchidos || [],
        sugeriu: novas.length > 0,
        completa: (estado?.elementos_vazios || []).length === 0,
      })
      setSugestoes(novas)
      await carregar({ silencioso: true })
      aoEstruturar?.()
    } catch (falha) {
      showToast(falha?.message || 'A estruturação não foi concluída.', 'error')
    } finally {
      setEmAcao('')
    }
  }

  const lerEntrada = async () => {
    setEmAcao('ler')

    try {
      await iniciarSessaoCopiloto(oportunidadeId)
      await carregar({ silencioso: true })
    } catch (falha) {
      showToast(falha?.message || 'Não foi possível ler a entrada.', 'error')
    } finally {
      setEmAcao('')
    }
  }

  const salvarResumo = async (sintese) => {
    setEmAcao('resumo')

    try {
      await atualizarSinteseCopiloto(oportunidadeId, sintese)
      await carregar({ silencioso: true })
      showToast('Resumo salvo. Ele orienta a próxima estruturação.')
      return true
    } catch (falha) {
      showToast(falha?.message || 'O resumo não foi salvo.', 'error')
      return false
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
      await responderCopiloto(
        oportunidadeId,
        texto,
        escolhida ? { elemento: escolhida.elemento, pergunta: escolhida.pergunta } : {},
      )
      setResposta('')
      setEscolhida(null)
    } catch (falha) {
      showToast(falha?.message || 'A resposta não foi registrada.', 'error')
      setEmAcao('')
      return
    }

    await estruturar()
  }

  const aceitar = async (sugestao) => {
    setEmAcao('aceitar')

    try {
      await aceitarSugestaoCopiloto(oportunidadeId, sugestao.elemento, sugestao.texto_sugerido)
      setSugestoes((atuais) => atuais.filter((item) => item.elemento !== sugestao.elemento))
      showToast(`Sugestão aceita em ${rotuloDoElemento(sugestao.elemento)}.`)
      await carregar({ silencioso: true })
      aoEstruturar?.()
    } catch (falha) {
      showToast(falha?.message || 'A sugestão não foi gravada.', 'error')
    } finally {
      setEmAcao('')
    }
  }

  const recusar = (sugestao) => {
    setSugestoes((atuais) => atuais.filter((item) => item.elemento !== sugestao.elemento))
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
  const perguntas = estado?.perguntas || []
  const preenchidos = TOTAL_DE_ELEMENTOS - pendentes.length
  const completa = pendentes.length === 0
  const ocupado = Boolean(emAcao)

  let rotuloDeEstruturar = 'Estruturar o que falta'
  if (emAcao === 'estruturar') rotuloDeEstruturar = 'Estruturando...'
  else if (preenchidos === 0) rotuloDeEstruturar = 'Estruturar com o Copiloto'
  else if (completa) rotuloDeEstruturar = 'Reavaliar a proposta'

  return (
    <section className="perfil-card copiloto">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">Copiloto de Estruturação</h2>
          <p className="perfil-card__description">
            O Copiloto lê a descrição da oportunidade, o resumo e as suas
            respostas e escreve uma primeira versão dos elementos vazios. No que
            você já escreveu, ele só sugere: a mudança entra se você aceitar.
          </p>
          <Progresso preenchidos={preenchidos} />
        </div>

        {podeConduzir ? (
          <button
            type="button"
            className="admin-btn"
            onClick={estruturar}
            disabled={ocupado}
            title={
              completa
                ? 'O Copiloto avalia os oito elementos e sugere mudanças, sem sobrescrever.'
                : undefined
            }
          >
            <Icone icon={appIcons.flow} />
            {rotuloDeEstruturar}
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

        {emAcao === 'ler' ? (
          <EsperaIA titulo="O Copiloto está lendo a entrada e escrevendo o resumo." />
        ) : null}

        {emAcao === 'estruturar' ? (
          <EsperaIA titulo="O Copiloto está escrevendo os elementos que faltam." />
        ) : null}

        <Resultado resultado={resultado} irPara={irPara} />

        <Sugestoes
          sugestoes={sugestoes}
          podeConduzir={podeConduzir}
          ocupado={ocupado}
          aoAceitar={aceitar}
          aoRecusar={recusar}
        />

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
            <li>Confira o resumo da entrada e corrija o que não estiver certo.</li>
            <li>Escolha uma pergunta e responda. A resposta atualiza a proposta na hora.</li>
            <li>Revise e salve o texto na aba Proposta estruturada.</li>
          </ol>
        ) : null}

        <ResumoDaEntrada
          sessao={sessao}
          podeConduzir={podeConduzir}
          ocupado={ocupado}
          aoLer={lerEntrada}
          aoSalvar={salvarResumo}
        />

        <Lacunas pendentes={pendentes} lacunas={estado?.lacunas || []} />

        {!completa || perguntas.length > 0 ? (
          <div className="copiloto__bloco">
            <h3 className="copiloto__subtitulo">Perguntas orientadoras</h3>
            <Perguntas
              perguntas={perguntas}
              baseDisponivel={Boolean(estado?.base_disponivel)}
              podeConduzir={podeConduzir}
              ocupado={ocupado}
              aoEscolher={setEscolhida}
            />

            {podeConduzir ? (
              <form className="copiloto__forma" onSubmit={enviarResposta}>
                {escolhida ? (
                  <div className="copiloto__escolhida">
                    <p className="copiloto__escolhida-texto">
                      {`Respondendo: ${escolhida.pergunta}`}
                    </p>
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm admin-btn--outline"
                      onClick={() => setEscolhida(null)}
                      disabled={ocupado}
                    >
                      Responder sem pergunta
                    </button>
                  </div>
                ) : null}

                <label className="admin-field">
                  <span className="admin-field__label">Sua resposta</span>
                  <textarea
                    className="admin-input admin-input--area"
                    rows={4}
                    value={resposta}
                    onChange={(event) => setResposta(event.target.value)}
                    placeholder="Ex.: a perda média é de 4% do lote."
                  />
                  <span className="admin-field__hint">
                    O Copiloto usa a resposta para preencher o elemento vazio. No que
                    já está escrito, ele sugere a mudança e você decide.
                  </span>
                </label>

                <button
                  type="submit"
                  className="admin-btn admin-btn--outline"
                  disabled={!resposta.trim() || ocupado}
                >
                  <Icone icon={appIcons.save} />
                  {emAcao === 'responder' || emAcao === 'estruturar'
                    ? 'Atualizando...'
                    : 'Responder e atualizar a proposta'}
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
