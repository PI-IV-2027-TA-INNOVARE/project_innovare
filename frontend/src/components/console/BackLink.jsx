import { Link } from 'react-router-dom'
import { Icone, appIcons } from '../../lib/icons'

export default function BackLink({ to, onClick, children }) {
  return (
    <Link className="admin-btn admin-btn--outline back-link" to={to} onClick={onClick}>
      <Icone icon={appIcons.back} aria-hidden="true" />
      {children}
    </Link>
  )
}
