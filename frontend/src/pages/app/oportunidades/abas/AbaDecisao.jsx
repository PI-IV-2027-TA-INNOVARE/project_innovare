import { useState } from 'react'
import { Icone, appIcons } from '../../../../lib/icons'
import { formatarUltimoAcesso } from '../../../../lib/people'
import { situacaoEncerrada } from '../etapas'
import { DECISOES, decisaoLabel } from '../oportunidadesData'
import AvisoPropostaNaoRevisada from './AvisoPropostaNaoRevisada'
import EtapaBloqueada from './EtapaBloqueada'

function bloqueioDa(situacao) {
  if (situacao === 'aguardando_decisao') return null

  if (situacao === 'revisar') {
    return {
      motivo: 'A oportunidade voltou para revisão. Retome a proposta estruturada para seguir.',
      etapa: 'proposta',
    }
  }

  return {
    motivo: 'Continuar e Revisar ficam liberados quando a pré-análise termina.',
    etapa: 'pre-analise',
  }
}

function DecisaoRegistrada({ decisao, titulo, aviso = null }) {
  return (
    <section className="perfil-card oportunidade-decisao">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">{titulo}</h2>
          <p className="perfil-card__description">
            Encaminhamento humano da oportunidade — preservado no histórico.
          </p>
        </div>

        <span className={`decisao-selo decisao-selo--${decisao.tipo}`}>
          {decisaoLabel(decisao.tipo)}
        </span>
      </header>

      <div className="perfil-card__body">
        {aviso}

        <blockquote className="oportunidade-justificativa">
          {decisao.justificativa}
        </blockquote>

        <p className="oportunidade-bloco__nota">
          Registrada por <strong>{decisao.autor}</strong> ·{' '}
          {formatarUltimoAcesso(decisao.em)}
        </p>
      </div>
    </section>
  )
}

export default function AbaDecisao({
  oportunidadeId,
  decisao,
  situacao,
  podeDecidir,
  onRegistrar,
  irPara,
}) {
  const [tipo, setTipo] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [erro, setErro] = useState('')

  const encerrada = situacaoEncerrada(situacao)

  const aviso = (
    <AvisoPropostaNaoRevisada
      oportunidadeId={oportunidadeId}
      irPara={irPara}
      podeRevisar={podeDecidir}
      bloqueiaEtapa={false}
      encerrada={encerrada}
    />
  )

  if (decisao && (!podeDecidir || encerrada)) {
    return <DecisaoRegistrada decisao={decisao} titulo="Decisão registrada" aviso={aviso} />
  }

  if (!podeDecidir) {
    return (
      <section className="perfil-card oportunidade-decisao">
        <header className="perfil-card__header">
          <div>
            <h2 className="perfil-card__title">Aguardando decisão</h2>
            <p className="perfil-card__description">
              O encaminhamento é registrado pelo Supervisor. Você acompanha o
              resultado por aqui.
            </p>
          </div>
        </header>

        {aviso}
      </section>
    )
  }

  const bloqueio = bloqueioDa(situacao)
  const liberada = (opcao) => opcao.id === 'arquivar' || !bloqueio

  const enviar = (event) => {
    event.preventDefault()

    if (!tipo) {
      setErro('Escolha o encaminhamento.')
      return
    }

    if (justificativa.trim().length < 10) {
      setErro('Descreva o motivo — é o que o histórico preserva.')
      return
    }

    onRegistrar(tipo, justificativa.trim())
  }

  return (
    <>
      {decisao ? <DecisaoRegistrada decisao={decisao} titulo="Última decisão" /> : null}

      <section className="perfil-card">
        <header className="perfil-card__header">
          <div>
            <h2 className="perfil-card__title">Registrar decisão</h2>
            <p className="perfil-card__description">
              A decisão é sua e fica no histórico. A plataforma não decide, e a IA
              tampouco — ela apenas estruturou, sugeriu e apontou lacunas.
            </p>
          </div>
        </header>

        <form className="perfil-card__body" onSubmit={enviar} noValidate>
          {aviso}

          {bloqueio ? (
            <EtapaBloqueada motivo={bloqueio.motivo} etapa={bloqueio.etapa} irPara={irPara} />
          ) : null}

          <fieldset className="decisao-opcoes">
            <legend className="admin-field__label">Encaminhamento</legend>

            {DECISOES.map((opcao) => (
              <label
                key={opcao.id}
                className={`decisao-opcao decisao-opcao--${opcao.tom}${tipo === opcao.id ? ' is-selected' : ''}${liberada(opcao) ? '' : ' is-disabled'}`}
              >
                <input
                  type="radio"
                  name="decisao"
                  value={opcao.id}
                  checked={tipo === opcao.id}
                  disabled={!liberada(opcao)}
                  onChange={() => {
                    setTipo(opcao.id)
                    setErro('')
                  }}
                />
                <span className="decisao-opcao__texto">
                  <strong>{opcao.label}</strong>
                  <span>{opcao.descricao}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="admin-field">
            <span className="admin-field__label">Justificativa</span>
            <textarea
              className="admin-input admin-input--area"
              rows={4}
              value={justificativa}
              aria-describedby={tipo === 'revisar' ? 'dica-justificativa' : undefined}
              onChange={(event) => {
                setJustificativa(event.target.value)
                setErro('')
              }}
              placeholder="O que sustenta este encaminhamento."
            />
          </label>

          {tipo === 'revisar' ? (
            <p id="dica-justificativa" className="admin-field__hint">
              Este texto vai para a empresa demandante, na plataforma e por e-mail.
              Não cite pessoas da equipe nem informação interna.
            </p>
          ) : null}

          {erro ? (
            <p className="admin-field__error" role="alert">{erro}</p>
          ) : null}

          <div className="decisao-acoes">
            <button type="submit" className="admin-btn">
              <Icone icon={appIcons.done} />
              Registrar decisão
            </button>
          </div>
        </form>
      </section>
    </>
  )
}
