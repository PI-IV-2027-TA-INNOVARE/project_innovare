import { useState } from 'react'
import { ORIGENS, SITUACOES } from '../../app/oportunidades/oportunidadesData'

const SELOS_DE_SITUACAO = ['entrada', 'aguardando_decisao', 'continuar', 'arquivada']

export default function LivePreview() {
  const [origem, setOrigem] = useState('externo')
  const [liberarAcesso, setLiberarAcesso] = useState(true)

  return (
    <section className="preview" aria-label="Prévia ao vivo da paleta">
      <header className="preview__header">
        <span className="preview__eyebrow">Prévia ao vivo</span>
        <p className="preview__note">Atualiza a cada cor alterada.</p>
      </header>

      <div className="preview__block">
        <h4 className="preview__block-title">Botões</h4>
        <div className="preview__row">
          <button type="button" className="admin-btn">Continuar</button>
          <button type="button" className="admin-btn admin-btn--outline">Revisar</button>
          <button type="button" className="admin-btn admin-btn--ghost">Arquivar</button>
        </div>
      </div>

      <div className="preview__block">
        <h4 className="preview__block-title">Campos</h4>

        <div className="preview__stack">
          <label className="preview__field">
            <span className="preview__label">Título da oportunidade</span>
            <input
              type="text"
              className="admin-input"
              defaultValue="Bioinsumo para cana-de-açúcar"
            />
          </label>

          <label className="preview__field">
            <span className="preview__label">Origem</span>
            <select
              className="admin-input admin-input--select"
              value={origem}
              onChange={(event) => setOrigem(event.target.value)}
            >
              {ORIGENS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="console-form__switch">
            <input
              type="checkbox"
              checked={liberarAcesso}
              onChange={(event) => setLiberarAcesso(event.target.checked)}
            />
            <span>Liberar acesso agora — o convite chega por e-mail</span>
          </label>
        </div>
      </div>

      <div className="preview__block">
        <h4 className="preview__block-title">Selos</h4>
        <div className="preview__row">
          {SITUACOES.filter((situacao) => SELOS_DE_SITUACAO.includes(situacao.id)).map(
            (situacao) => (
              <span key={situacao.id} className={`fluxo-badge fluxo-badge--${situacao.id}`}>
                {situacao.label}
              </span>
            )
          )}
        </div>
        <div className="preview__row">
          {ORIGENS.map((item) => (
            <span key={item.id} className={`origem-badge origem-badge--${item.id}`}>
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="preview__block">
        <h4 className="preview__block-title">Cartão</h4>

        <article className="preview-card">
          <span className="preview-card__eyebrow">Problema externo · OP-2026-013</span>
          <h5 className="preview-card__title">Bioinsumo para cana-de-açúcar</h5>
          <p className="preview-card__text">
            Controle biológico de pragas da cana com microrganismos nativos, em
            substituição parcial a defensivos químicos.
          </p>

          <div className="preview__row">
            <span className="fluxo-badge fluxo-badge--aguardando_decisao">Aguardando decisão</span>
          </div>
        </article>
      </div>

      <div className="preview__block">
        <h4 className="preview__block-title">Alertas</h4>

        <div className="preview__stack">
          <p className="preview-alert preview-alert--ok">
            Equipe potencial sugerida com 4 pesquisadores.
          </p>
          <p className="preview-alert preview-alert--error">
            Competência necessária sem correspondência na rede.
          </p>
        </div>
      </div>
    </section>
  )
}
