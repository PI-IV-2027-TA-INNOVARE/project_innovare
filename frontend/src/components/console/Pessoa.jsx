import AdminModal from './AdminModal'
import { Avatar } from './ConsoleTable'

export function BotaoPessoa({ nome, meta, onClick }) {
  return (
    <button
      type="button"
      className="user-cell user-cell--botao"
      onClick={onClick}
      aria-label={`Abrir a ficha de ${nome}`}
    >
      <Avatar nome={nome} />
      <span className="user-cell__text">
        <span className="user-cell__name">{nome}</span>
        {meta ? <span className="user-cell__meta">{meta}</span> : null}
      </span>
    </button>
  )
}

export function FichaDePessoa({ nome, descricao, linhas, acoes, onFechar, size = 'lg' }) {
  return (
    <AdminModal
      title={nome}
      description={descricao}
      onClose={onFechar}
      size={size}
      footer={
        <>
          <button type="button" className="admin-btn admin-btn--outline" onClick={onFechar}>
            Fechar
          </button>
          {acoes}
        </>
      }
    >
      <dl className="detail-list">
        {linhas.map(({ rotulo, valor }) => (
          <div className="detail-list__row" key={rotulo}>
            <dt>{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
    </AdminModal>
  )
}
