import AdminModal from './AdminModal'

export default function GuardaDeSaida({ aberto, titulo, nota, onContinuar, onDescartar, onSair }) {
  if (!aberto) return null

  return (
    <AdminModal
      title={titulo}
      description="O que você digitou fica guardado neste navegador e volta quando você abrir o formulário de novo. Nada é enviado enquanto você não cadastrar."
      onClose={onContinuar}
      size="sm"
      footer={
        <>
          <button type="button" className="admin-btn admin-btn--danger" onClick={onDescartar}>
            Descartar
          </button>
          <button type="button" className="admin-btn admin-btn--outline" onClick={onContinuar}>
            Continuar editando
          </button>
          <button type="button" className="admin-btn" onClick={onSair}>
            Sair e guardar
          </button>
        </>
      }
    >
      <p className="guarda-saida__nota">{nota}</p>
    </AdminModal>
  )
}
