import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../../lib/icons'

export default function BackLink({ to, onClick, children }) {
  return (
    <Link className="back-link" to={to} onClick={onClick}>
      <FontAwesomeIcon icon={appIcons.back} aria-hidden="true" />
      {children}
    </Link>
  )
}
