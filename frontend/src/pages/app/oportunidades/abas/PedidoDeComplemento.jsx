import { useId, useState } from 'react'
import { Icone, appIcons } from '../../../../lib/icons'
import { solicitarComplemento } from '../../../../services/pdConnectApi'

export default function PedidoDeComplemento({ codigo, aoRegistrar }) {
  const id = useId()
  const [aberto, setAberto] = useState(false)
  const [pedido, setPedido] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)

  const abrir = () => {
    setAberto(true)
    setEnviado(false)
  }

  const cancelar = () => {
    setAberto(false)
    setPedido('')
    setErro('')
  }

  const enviar = async (event) => {
    event.preventDefault()

    if (!pedido.trim() || enviando) return

    setEnviando(true)
    setErro('')

    try {
      const criada = await solicitarComplemento(codigo, pedido.trim())

      aoRegistrar?.({
        id: `solicitacao-${criada.ocorrido_em}`,
        em: Date.parse(criada.ocorrido_em),
        categoria: 'oportunidade',
        ator: criada.autor_nome,
        texto: `Complementação solicitada ao Demandante: ${criada.mensagem}`,
      })
      setPedido('')
      setAberto(false)
      setEnviado(true)
    } catch (problema) {
      setErro(problema?.message || 'Não foi possível solicitar a complementação.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="complemento">
      <h3 className="roteiro__subtitulo">Falta alguma informação na entrada?</h3>

      {enviado ? (
        <p className="complemento__enviado" role="status">
          <Icone icon={appIcons.done} />
          Pedido enviado ao Demandante Externo. Ele aparece no Histórico.
        </p>
      ) : null}

      {aberto ? (
        <form className="complemento__forma" onSubmit={enviar} noValidate>
          <div className="admin-field">
            <label className="admin-field__label" htmlFor={`${id}-pedido`}>
              Que informação falta na entrada?
            </label>
            <textarea
              id={`${id}-pedido`}
              className="admin-input admin-input--area"
              rows={3}
              maxLength={2000}
              value={pedido}
              onChange={(event) => setPedido(event.target.value)}
              aria-describedby={`${id}-dica`}
              autoFocus
            />
            <span id={`${id}-dica`} className="admin-field__hint">
              O Demandante Externo recebe um aviso com este texto e responde pela tela da
              oportunidade. Pedir complementação não é decisão e não muda a etapa.
            </span>
          </div>

          {erro ? (
            <p className="login-message" role="alert">
              {erro}
            </p>
          ) : null}

          <div className="complemento__acoes">
            <button type="submit" className="admin-btn" disabled={!pedido.trim() || enviando}>
              <Icone icon={appIcons.notifications} />
              {enviando ? 'Enviando...' : 'Enviar o pedido'}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--outline"
              onClick={cancelar}
              disabled={enviando}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="roteiro__resumo">
            Peça ao Demandante Externo o que não veio no relato: um dado, um laudo, um prazo.
          </p>
          <button type="button" className="admin-btn admin-btn--outline complemento__abrir" onClick={abrir}>
            <Icone icon={appIcons.notifications} />
            Pedir complementação
          </button>
        </>
      )}
    </div>
  )
}
