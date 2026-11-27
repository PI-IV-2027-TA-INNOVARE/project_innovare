import { useState } from 'react'
import { Icone, appIcons } from '../../../../lib/icons'
import { formatarUltimoAcesso } from '../../../../lib/people'
import { registrarObservacao } from '../../../../services/pdConnectApi'

export default function ObservacoesDaAvaliacao({ codigo, observacoes, aoRegistrar }) {
  const [texto, setTexto] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [erro, setErro] = useState('')

  const ordenadas = [...observacoes].sort((a, b) => b.em - a.em)

  const registrar = async (event) => {
    event.preventDefault()

    if (!texto.trim() || registrando) return

    setRegistrando(true)
    setErro('')

    try {
      const criada = await registrarObservacao(codigo, texto.trim())

      aoRegistrar?.({
        id: `observacao-${criada.ocorrido_em}`,
        em: Date.parse(criada.ocorrido_em),
        categoria: 'observacao',
        ator: criada.autor_nome,
        texto: criada.texto,
      })
      setTexto('')
    } catch (problema) {
      setErro(problema?.message || 'Não foi possível registrar a observação.')
    } finally {
      setRegistrando(false)
    }
  }

  return (
    <section className="perfil-card">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">Observações da avaliação</h2>
          <p className="perfil-card__description">
            Anote o que você percebe enquanto avalia. Cada observação fica no
            histórico com seu nome e a data.
          </p>
        </div>
      </header>

      <div className="perfil-card__body">
        {ordenadas.length > 0 ? (
          <ol className="trilha" aria-label="Observações registradas">
            {ordenadas.map((observacao) => (
              <li className="trilha__item" key={observacao.id}>
                <span className="trilha__marca trilha__marca--observacao" aria-hidden="true">
                  <Icone icon={appIcons.edit} />
                </span>

                <div className="trilha__corpo">
                  <p className="trilha__texto">{observacao.texto}</p>
                  <p className="trilha__meta">
                    <span className="trilha__ator">{observacao.ator}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={new Date(observacao.em).toISOString()}>
                      {formatarUltimoAcesso(observacao.em)}
                    </time>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="oportunidade-bloco__vazio">
            Nenhuma observação registrada nesta oportunidade.
          </p>
        )}

        <form className="perfil-card__body" onSubmit={registrar} noValidate>
          <label className="admin-field">
            <span className="admin-field__label">Nova observação</span>
            <textarea
              className="admin-input admin-input--area"
              rows={3}
              maxLength={2000}
              value={texto}
              aria-describedby="dica-observacao"
              placeholder="O que você quer deixar documentado nesta avaliação."
              onChange={(event) => {
                setTexto(event.target.value)
                setErro('')
              }}
            />
          </label>

          <p id="dica-observacao" className="admin-field__hint">
            Não é decisão e não muda a etapa. A empresa demandante não vê as
            observações.
          </p>

          {erro ? (
            <p className="admin-field__error" role="alert">{erro}</p>
          ) : null}

          <div className="decisao-acoes">
            <button
              type="submit"
              className="admin-btn admin-btn--outline"
              disabled={!texto.trim() || registrando}
            >
              <Icone icon={appIcons.edit} />
              {registrando ? 'Registrando...' : 'Registrar observação'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
