import { Link } from 'react-router-dom'
import { Icone, appIcons } from '../../lib/icons'

export default function BackLink({ to, onClick, children }) {
  return (
    <Link className="back-link" to={to} onClick={onClick}>
      <Icone icon={appIcons.back} aria-hidden="true" />
      {children}
    </Link>
  )
}
