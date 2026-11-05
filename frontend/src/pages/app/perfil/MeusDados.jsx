import { useEffect, useState } from 'react'
import { salvarNoComputador } from '../../../lib/anexos'
import { Icone, appIcons } from '../../../lib/icons'
import {
  baixarMeusDados,
  obterPedidoDeExclusao,
  pedirExclusaoDaConta,
} from '../../../services/pdConnectApi'

function dataCurta(valor) {
  const data = valor ? new Date(valor) : null
  return data && !Number.isNaN(data.getTime()) ? data.toLocaleDateString('pt-BR') : ''
}

/**
 * Os direitos de quem tem conta: baixar a cópia dos próprios dados e pedir a
 * exclusão. Quem atende o pedido é o Administrador, anonimizando a conta.
 */
export default function MeusDados({ aoConcluir }) {
  const [pedidoEm, setPedidoEm] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true

    obterPedidoDeExclusao()
      .then((dados) => {
        if (ativo) setPedidoEm(dados?.solicitada_em || null)
      })
      .catch(() => {})

    return () => {
      ativo = false
    }
  }, [])

  const baixar = async () => {
    setOcupado('baixar')
    setErro('')

    try {
      salvarNoComputador(await baixarMeusDados())
    } catch (falha) {
      setErro(falha?.message || 'Não foi possível baixar a cópia agora.')
    } finally {
      setOcupado('')
    }
  }

  const pedir = async () => {
    setOcupado('pedir')
    setErro('')

    try {
      const dados = await pedirExclusaoDaConta()
      setPedidoEm(dados?.solicitada_em || new Date().toISOString())
      setConfirmando(false)
      aoConcluir?.('Pedido de exclusão enviado.')
    } catch (falha) {
      setErro(falha?.message || 'Não foi possível enviar o pedido agora.')
    } finally {
      setOcupado('')
    }
  }

  return (
    <div className="meus-dados">
      <div className="meus-dados__bloco" role="group" aria-label="Cópia dos dados">
        <p className="perfil-card__note">A cópia traz:</p>
        <ul className="meus-dados__lista">
          <li>a sua conta;</li>
          <li>o seu perfil na rede;</li>
          <li>as oportunidades que você cadastrou;</li>
          <li>o que você fez na plataforma.</li>
        </ul>

        <div className="meus-dados__acoes">
          <button
            type="button"
            className="admin-btn"
            onClick={baixar}
            disabled={Boolean(ocupado)}
          >
            <Icone icon={appIcons.export} />
            {ocupado === 'baixar' ? 'Preparando...' : 'Baixar uma cópia dos meus dados'}
          </button>
        </div>
      </div>

      <div
        className="meus-dados__bloco meus-dados__bloco--exclusao"
        role="group"
        aria-label="Exclusão da conta"
      >
        <p className="perfil-card__note">
          Se pedir a exclusão, quem administra as contas apaga o que identifica
          você; o histórico das oportunidades continua, com &quot;pessoa
          removida&quot; no lugar do seu nome.
        </p>

        {!pedidoEm && !confirmando ? (
          <div className="meus-dados__acoes">
            <button
              type="button"
              className="admin-btn admin-btn--ghost meus-dados__excluir"
              onClick={() => setConfirmando(true)}
              disabled={Boolean(ocupado)}
            >
              <Icone icon={appIcons.remove} />
              Pedir a exclusão da minha conta
            </button>
          </div>
        ) : null}

        {confirmando ? (
          <div className="admin-callout admin-callout--alerta meus-dados__confirmacao" role="group" aria-label="Confirmar exclusão">
            <Icone icon={appIcons.warning} className="admin-callout__icon" />
            <p className="admin-callout__text">
              Depois de atendido o pedido, você não entra mais na plataforma e o
              seu perfil sai da rede. Quer mesmo pedir?
            </p>
            <div className="meus-dados__acoes">
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                onClick={pedir}
                disabled={Boolean(ocupado)}
              >
                {ocupado === 'pedir' ? 'Enviando...' : 'Confirmar o pedido'}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--outline"
                onClick={() => setConfirmando(false)}
                disabled={Boolean(ocupado)}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {pedidoEm ? (
          <p className="perfil-card__note" role="status">
            Exclusão pedida em {dataCurta(pedidoEm)}. Quem administra as contas vai
            atender; até lá, a conta segue funcionando.
          </p>
        ) : null}
      </div>

      {erro ? (
        <p className="admin-field__error" role="alert">{erro}</p>
      ) : null}
    </div>
  )
}
