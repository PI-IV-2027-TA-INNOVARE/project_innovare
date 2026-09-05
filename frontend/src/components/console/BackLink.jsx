import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../../lib/icons'

/**
 * Volta explícita para a lista de origem.
 *
 * Um breadcrumb não faz este trabalho: ele diz *onde você está*, e quem acabou
 * de abrir um registro quer saber *como sair dele*. São perguntas diferentes, e
 * a segunda precisa de um alvo grande, com seta, no canto superior esquerdo —
 * onde a mão já procura.
 *
 * Sempre um `<Link>` para uma rota fixa, nunca `history.back()`: a pessoa pode
 * ter chegado por link direto, e aí o "voltar" do navegador a tiraria do app.
 */
export default function BackLink({ to, children }) {
  return (
    <Link className="back-link" to={to}>
      <FontAwesomeIcon icon={appIcons.back} aria-hidden="true" />
      {children}
    </Link>
  )
}
