import { useId, useState } from 'react'
import { Icone, appIcons } from '../../lib/icons'

/**
 * O detalhe a um clique, aberto no lugar.
 *
 * O conteúdo fica no documento mesmo fechado: some da vista, não da página, e
 * o leitor de tela anuncia o botão como expansível e o que ele controla.
 */
export default function VerDetalhes({
  children,
  rotulo = 'Ver detalhes',
  rotuloAberto = 'Ocultar detalhes',
  abertoAoIniciar = false,
  className = '',
}) {
  const [aberto, setAberto] = useState(abertoAoIniciar)
  const id = useId()

  return (
    <div className={`ver-detalhes${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="ver-detalhes__botao"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((atual) => !atual)}
      >
        <Icone icon={aberto ? appIcons.disclosure : appIcons.next} />
        {aberto ? rotuloAberto : rotulo}
      </button>

      <div id={id} className="ver-detalhes__conteudo" hidden={!aberto}>
        {children}
      </div>
    </div>
  )
}
