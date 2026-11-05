import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { rotaInicialDe } from '../lib/rotas'

export default function AvisoDeContaTrocada() {
  const { user, contaTrocada, contaTrocadaNoPainel, dispensarAvisoDeConta } = useAuth()
  const navigate = useNavigate()
  const levarAoPainel = Boolean(contaTrocada?.levarAoPainel)
  const papel = user?.role

  useEffect(() => {
    if (!levarAoPainel) return

    navigate(rotaInicialDe(papel), { replace: true })
    contaTrocadaNoPainel()
  }, [contaTrocadaNoPainel, levarAoPainel, navigate, papel])

  if (!contaTrocada) return null

  return (
    <div className="aviso-de-conta" role="alert">
      <p className="aviso-de-conta__texto">
        <strong>Outra conta entrou neste navegador.</strong> Esta aba passou para
        a conta de {contaTrocada.nome} e voltou ao painel dela. Para usar duas
        contas ao mesmo tempo, abra a segunda numa janela anônima ou em outro
        navegador.
      </p>
      <button type="button" className="btn btn-outline" onClick={dispensarAvisoDeConta}>
        Entendi
      </button>
    </div>
  )
}
