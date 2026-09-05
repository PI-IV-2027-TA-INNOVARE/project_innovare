import { useState } from 'react'

/**
 * Prévia ao vivo da paleta.
 *
 * Não recebe nenhuma cor por prop: todo elemento aqui lê as mesmas CSS custom
 * properties que o resto da aplicação, então mudar um token no painel repinta
 * esta prévia no mesmo frame, sem estado intermediário.
 *
 * Mostra os componentes que de fato carregam a identidade — botões, campos,
 * selos, cartão de oportunidade e alertas. Uma prévia que só exibisse um botão
 * esconderia justamente o que quebra quando alguém escurece o texto de apoio.
 */
export default function LivePreview() {
  const [alerta, setAlerta] = useState(true)
  const [revisado, setRevisado] = useState(false)
  const [origem, setOrigem] = useState('externo')

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
              className="admin-input"
              value={origem}
              onChange={(event) => setOrigem(event.target.value)}
            >
              <option value="externo">Problema externo</option>
              <option value="interna">Ideia interna</option>
            </select>
          </label>

          <label className="preview__switch">
            <input
              type="checkbox"
              role="switch"
              checked={alerta}
              onChange={(event) => setAlerta(event.target.checked)}
            />
            <span className="preview__switch-track" aria-hidden="true" />
            <span className="preview__label">Notificar o Supervisor</span>
          </label>

          <label className="preview__check">
            <input
              type="checkbox"
              checked={revisado}
              onChange={(event) => setRevisado(event.target.checked)}
            />
            <span className="preview__label">Proposta revisada por humano</span>
          </label>
        </div>
      </div>

      <div className="preview__block">
        <h4 className="preview__block-title">Selos</h4>
        <div className="preview__row">
          <span className="preview-pill preview-pill--ok">Concluída</span>
          <span className="preview-pill preview-pill--warn">Lacuna</span>
          <span className="preview-pill preview-pill--error">Bloqueada</span>
        </div>
      </div>

      <div className="preview__block">
        <h4 className="preview__block-title">Cartão</h4>

        <article className="preview-card">
          <span className="preview-card__eyebrow">Oportunidade · PIPE/FAPESP</span>
          <h5 className="preview-card__title">Bioinsumo para cana-de-açúcar</h5>
          <p className="preview-card__text">
            Estruturação assistida, matching com a rede interna e pré-análise de
            maturidade.
          </p>

          <div className="preview__row">
            <button type="button" className="admin-btn">Continuar</button>
            <button type="button" className="admin-btn admin-btn--outline">Revisar</button>
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
