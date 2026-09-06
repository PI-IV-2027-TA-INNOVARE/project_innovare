import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../lib/icons'
import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle({ className = '' }) {
  const { isDark, toggleTheme } = useTheme()
  const label = isDark ? 'Ativar tema claro' : 'Ativar tema escuro'

  return (
    <button
      type="button"
      className={`theme-toggle${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
      onClick={toggleTheme}
    >
      <FontAwesomeIcon icon={isDark ? appIcons.themeLight : appIcons.themeDark} />
    </button>
  )
}
