import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useBranding } from '../../../context/BrandingContext'
import { useTheme } from '../../../context/ThemeContext'
import { appIcons } from '../../../lib/icons'
import {
  TOKEN_KIND_LABELS,
  getDerivedVariables,
  isValidHex,
  toRgbaString,
} from '../../../theme/brandTokens'
import LivePreview from './LivePreview'

/**
 * Painel de Aparência.
 *
 * Cada alteração chama `setTokenValue`, que reescreve a CSS custom property no
 * <html>. Como toda a aplicação lê essas variáveis, a mudança aparece na hora —
 * não há salvar, recarregar nem rebuild. O ajuste vale por tema: claro e escuro
 * guardam paletas independentes.
 *
 * A tela separa dois públicos na mesma superfície: quem quer trocar uma cor vê
 * nome, amostra e HEX; quem precisa do nome da custom property abre "Avançado".
 * Deixar a variável sempre à mostra fazia o cartão parecer configuração de
 * sistema, não escolha de identidade.
 */

const TOAST_MS = 2600
const COPIED_MS = 1600

/** Remove acentos para que "superfície" encontre "Superficie" e vice-versa. */
function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Valor seguro para o <input type="color">, que só aceita #rrggbb. */
function toColorInputValue(value, fallback) {
  return isValidHex(value) ? value : fallback
}

/**
 * Copia sem depender da Clipboard API: navegadores antigos e contextos não
 * seguros (http://) não expõem `navigator.clipboard`, e o painel roda em rede
 * interna. Devolve `false` quando nada foi copiado, para a UI não mentir.
 */
async function copyText(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permissão negada ou contexto inseguro: cai no fallback abaixo.
  }

  try {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(field)
    return ok
  } catch {
    return false
  }
}

function TokenCard({ token, value, isCustomized, onChange, onReset, onCopy, copied }) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const advancedId = useId()
  const kindLabel = TOKEN_KIND_LABELS[token.kind] || 'Token'
  const derived = useMemo(
    () => (advancedOpen ? getDerivedVariables(token, value) : []),
    [advancedOpen, token, value]
  )

  return (
    <article className={`token-card${isCustomized ? ' is-customized' : ''}`}>
      <label className="token-card__swatch" title={`Escolher ${token.label}`}>
        <span className="token-card__swatch-fill" style={{ background: value }} aria-hidden="true" />
        <span className="token-card__swatch-action" aria-hidden="true">Escolher cor</span>
        <input
          type="color"
          value={toColorInputValue(value, token.light)}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`Escolher ${token.label}`}
        />
      </label>

      <div className="token-card__body">
        <div className="token-card__heading">
          <h4 className="token-card__name">{token.label}</h4>
          <span className={`token-badge token-badge--${token.kind}`}>{kindLabel}</span>
        </div>

        <p className="token-card__hint">{token.hint}</p>

        <div className="token-card__controls">
          <input
            type="text"
            className="token-card__hex"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck="false"
            aria-label={`Valor de ${token.label}`}
          />

          <button
            type="button"
            className={`icon-button token-card__copy${copied ? ' is-done' : ''}`}
            onClick={() => onCopy(value)}
            title={`Copiar ${value}`}
            aria-label={`Copiar ${value}`}
          >
            <FontAwesomeIcon icon={copied ? appIcons.done : appIcons.copy} />
          </button>
        </div>

        <div className="token-card__footer">
          <button
            type="button"
            className="disclosure"
            aria-expanded={advancedOpen}
            aria-controls={advancedId}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <FontAwesomeIcon
              icon={appIcons.disclosure}
              className={`disclosure__chevron${advancedOpen ? ' is-open' : ''}`}
            />
            Avançado
          </button>

          {isCustomized ? (
            <span className="token-card__state">
              <span className="token-card__flag">alterado</span>
              <button
                type="button"
                className="link-button"
                onClick={onReset}
                title={`Restaurar o padrão da AC2 para ${token.label}`}
              >
                Desfazer
              </button>
            </span>
          ) : null}
        </div>

        <dl id={advancedId} className="token-advanced" hidden={!advancedOpen}>
          <div className="token-advanced__row">
            <dt>Token CSS</dt>
            <dd><code>{token.cssVar}</code></dd>
          </div>
          <div className="token-advanced__row">
            <dt>RGBA</dt>
            <dd><code>{toRgbaString(value)}</code></dd>
          </div>

          {derived.length > 0 ? (
            <div className="token-advanced__row">
              <dt>Recalcula</dt>
              <dd>
                <ul className="token-advanced__derived">
                  {derived.map((variable) => (
                    <li key={variable.name}><code>{variable.name}</code></li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </article>
  )
}

function TokenGroup({ group, branding, customized, collapsed, onToggle, cardProps }) {
  const panelId = useId()

  return (
    <section className={`tokens-group${collapsed ? ' is-collapsed' : ''}`}>
      <button
        type="button"
        className="tokens-group__toggle"
        aria-expanded={!collapsed}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <FontAwesomeIcon
          icon={appIcons.disclosure}
          className={`disclosure__chevron${collapsed ? '' : ' is-open'}`}
        />
        <span className="tokens-group__title">{group.label}</span>
        <span className="tokens-group__count">
          {group.tokens.length} {group.tokens.length === 1 ? 'cor' : 'cores'}
        </span>
      </button>

      <div id={panelId} className="tokens-group__panel" hidden={collapsed}>
        <p className="tokens-group__description">{group.description}</p>

        <div className="tokens-group__grid">
          {group.tokens.map((token) => (
            <TokenCard
              key={token.id}
              token={token}
              value={branding[token.id]}
              isCustomized={customized.has(token.id)}
              {...cardProps(token)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default function AppearanceSection() {
  const { theme, toggleTheme } = useTheme()
  const {
    branding,
    groups,
    customizedTokenIds,
    isCustomized,
    setTokenValue,
    resetToken,
    resetTheme,
  } = useBranding()

  const [query, setQuery] = useState('')
  // Só o primeiro grupo — Marca — nasce aberto. É a identidade da AC2 e o que
  // quase toda visita vem mexer; abrir os quatro faz a tela nascer com doze
  // cartões e empurra a prévia para fora da dobra. Recolher TODOS seria pior:
  // a tela abriria sem nenhuma cor à vista, e a prévia ao vivo perde o sentido
  // quando não há o que comparar com ela.
  const [collapsedGroups, setCollapsedGroups] = useState(
    () => new Set(groups.slice(1).map((group) => group.id))
  )
  const [copiedTokenId, setCopiedTokenId] = useState(null)
  const [toast, setToast] = useState(null)

  const toastTimer = useRef(null)
  const copiedTimer = useRef(null)

  useEffect(() => () => {
    clearTimeout(toastTimer.current)
    clearTimeout(copiedTimer.current)
  }, [])

  const customized = useMemo(() => new Set(customizedTokenIds), [customizedTokenIds])

  const showToast = useCallback((message) => {
    setToast({ message, id: Date.now() })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  const handleChange = useCallback((tokenId, value) => {
    setTokenValue(tokenId, value)
    showToast('Aparência salva automaticamente.')
  }, [setTokenValue, showToast])

  const handleReset = useCallback((tokenId, label) => {
    resetToken(tokenId)
    showToast(`${label} voltou ao padrão da AC2.`)
  }, [resetToken, showToast])

  const handleResetTheme = useCallback(() => {
    resetTheme()
    showToast('Identidade oficial da AC2 restaurada.')
  }, [resetTheme, showToast])

  const handleCopy = useCallback(async (tokenId, value) => {
    const ok = await copyText(value)

    if (!ok) {
      showToast('Não foi possível copiar. Selecione o valor e use Ctrl+C.')
      return
    }

    setCopiedTokenId(tokenId)
    clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopiedTokenId(null), COPIED_MS)
    showToast(`${value} copiado.`)
  }, [showToast])

  const toggleGroup = useCallback((groupId) => {
    setCollapsedGroups((current) => {
      const next = new Set(current)

      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }

      return next
    })
  }, [])

  // Busca por nome da cor, valor, grupo, uso ou nome da custom property — a
  // pessoa pode chegar por qualquer um deles.
  const visibleGroups = useMemo(() => {
    const term = normalize(query)

    if (!term) return groups

    return groups
      .map((group) => {
        const groupMatches = normalize(group.label).includes(term)

        const tokens = group.tokens.filter((token) => {
          const haystack = [
            token.label,
            token.hint,
            token.cssVar,
            TOKEN_KIND_LABELS[token.kind],
            branding[token.id],
          ]

          return groupMatches || haystack.some((part) => normalize(part).includes(term))
        })

        return { ...group, tokens }
      })
      .filter((group) => group.tokens.length > 0)
  }, [branding, groups, query])

  const totalTokens = groups.reduce((total, group) => total + group.tokens.length, 0)
  const visibleTokens = visibleGroups.reduce((total, group) => total + group.tokens.length, 0)

  const cardProps = useCallback((token) => ({
    onChange: (value) => handleChange(token.id, value),
    onReset: () => handleReset(token.id, token.label),
    onCopy: (value) => handleCopy(token.id, value),
    copied: copiedTokenId === token.id,
  }), [copiedTokenId, handleChange, handleCopy, handleReset])

  return (
    <div className="admin-section">
      <header className="admin-section__header">
        <div className="admin-section__heading">
          <h2 className="admin-section__title">Aparência</h2>
          <p className="admin-section__subtitle">
            Ajuste as cores da plataforma. As mudanças valem imediatamente, sem
            recarregar a página, e cada tema guarda sua própria paleta.
          </p>
        </div>

        <div className="admin-section__actions">
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={toggleTheme}
            title="Alternar entre o tema claro e o escuro"
          >
            <FontAwesomeIcon icon={theme === 'dark' ? appIcons.themeDark : appIcons.themeLight} />
            Tema: {theme === 'dark' ? 'escuro' : 'claro'}
          </button>

          <button
            type="button"
            className="admin-btn admin-btn--outline"
            onClick={handleResetTheme}
            disabled={!isCustomized}
            title="Restaurar identidade oficial da AC2."
          >
            <FontAwesomeIcon icon={appIcons.reset} />
            Restaurar padrões
          </button>
        </div>
      </header>

      <div className="appearance-layout">
        <div className="appearance-main">
          <div className="appearance-toolbar">
            <div className="admin-search">
              <FontAwesomeIcon icon={appIcons.search} className="admin-search__icon" />
              <input
                type="search"
                className="admin-search__input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar configuração"
                aria-label="Buscar configuração de aparência"
              />
            </div>

            <p className="appearance-toolbar__count" aria-live="polite">
              {query
                ? `${visibleTokens} de ${totalTokens} cores`
                : `${totalTokens} cores · ${customizedTokenIds.length} alteradas`}
            </p>
          </div>

          {visibleGroups.length > 0 ? (
            <div className="appearance-groups">
              {visibleGroups.map((group) => (
                <TokenGroup
                  key={group.id}
                  group={group}
                  branding={branding}
                  customized={customized}
                  collapsed={!query && collapsedGroups.has(group.id)}
                  onToggle={() => toggleGroup(group.id)}
                  cardProps={cardProps}
                />
              ))}
            </div>
          ) : (
            <p className="appearance-empty" role="status">
              Nenhuma configuração encontrada para <strong>{query}</strong>.
            </p>
          )}
        </div>

        <aside className="appearance-aside">
          <LivePreview />
        </aside>
      </div>

      {toast ? (
        <div className="admin-toast" role="status" aria-live="polite">
          <FontAwesomeIcon icon={appIcons.done} className="admin-toast__icon" />
          {toast.message}
        </div>
      ) : null}
    </div>
  )
}
