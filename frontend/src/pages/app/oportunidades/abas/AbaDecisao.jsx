import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../../../../lib/icons'
import { formatarUltimoAcesso } from '../../../../lib/people'
import { DECISOES, decisaoLabel } from '../oportunidadesData'

/**
 * Decisão do Supervisor (RF11 / RN-A07).
 *
 * Três regras de domínio, todas visíveis na tela:
 *
 * 1. A decisão é **humana**. A IA não aprova, não reprova e não arquiva
 *    (AGENTS.md §0.2) — por isso não há botão "aceitar sugestão da IA".
 * 2. Só o **Supervisor** registra. Quem não é vê a decisão, não o formulário.
 * 3. A **justificativa é obrigatória**: é o que a rastreabilidade (RF12) precisa
 *    guardar, e "Arquivar" sem motivo registrado é exatamente o que ninguém
 *    consegue reconstituir seis meses depois.
 */
export default function AbaDecisao({ decisao, podeDecidir, onRegistrar }) {
  const [tipo, setTipo] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [erro, setErro] = useState('')

  if (decisao) {
    return (
      <section className="perfil-card oportunidade-decisao">
        <header className="perfil-card__header">
          <div>
            <h2 className="perfil-card__title">Decisão registrada</h2>
            <p className="perfil-card__description">
              Encaminhamento humano da oportunidade — preservado no histórico.
            </p>
          </div>

          <span className={`decisao-selo decisao-selo--${decisao.tipo}`}>
            {decisaoLabel(decisao.tipo)}
          </span>
        </header>

        <div className="perfil-card__body">
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

  if (!podeDecidir) {
    return (
      <section className="perfil-card">
        <header className="perfil-card__header">
          <div>
            <h2 className="perfil-card__title">Aguardando decisão</h2>
            <p className="perfil-card__description">
              O encaminhamento é registrado pelo Supervisor (RN-A07). Você
              acompanha o resultado por aqui.
            </p>
          </div>
        </header>
      </section>
    )
  }

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
        <fieldset className="decisao-opcoes">
          <legend className="admin-field__label">Encaminhamento</legend>

          {DECISOES.map((opcao) => (
            <label
              key={opcao.id}
              className={`decisao-opcao decisao-opcao--${opcao.tom}${tipo === opcao.id ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name="decisao"
                value={opcao.id}
                checked={tipo === opcao.id}
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
            onChange={(event) => {
              setJustificativa(event.target.value)
              setErro('')
            }}
            placeholder="O que sustenta este encaminhamento."
          />
        </label>

        {erro ? (
          <p className="admin-field__error" role="alert">{erro}</p>
        ) : null}

        <div className="decisao-acoes">
          <button type="submit" className="admin-btn">
            <FontAwesomeIcon icon={appIcons.done} />
            Registrar decisão
          </button>
        </div>
      </form>
    </section>
  )
}
