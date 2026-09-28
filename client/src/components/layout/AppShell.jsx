import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ThemeSwitcher from '../ThemeSwitcher.jsx'
import { useTheme } from '../../theme/core/ThemeProvider.jsx'

function isTrailPath(pathname) {
  return pathname === '/' || pathname === '/onboarding' || pathname.startsWith('/topic/')
}

function isRouteActive(pathname, destination) {
  if (destination === '/') return isTrailPath(pathname)
  return pathname === destination || pathname.startsWith(`${destination}/`)
}

function ReviewLink({ dueCount, className }) {
  const { pathname } = useLocation()
  const hasDueCount = Number.isFinite(dueCount) && dueCount > 0

  return (
    <Link
      className={className}
      to="/reviews"
      aria-current={isRouteActive(pathname, '/reviews') ? 'page' : undefined}
      aria-label={hasDueCount ? `Reviews, ${dueCount} due` : 'Reviews'}
    >
      <span>Reviews</span>
      {hasDueCount && <span className="app-shell-count" aria-hidden="true">{dueCount}</span>}
    </Link>
  )
}

export function AppShellHeader({ dueCount }) {
  const { pathname } = useLocation()
  const [openPopover, setOpenPopover] = useState(null)
  const switcherButton = useRef(null)
  const themeButton = useRef(null)
  const { theme, selectTheme } = useTheme()

  useEffect(() => {
    if (!openPopover) return undefined
    function closeOnEscape(event) {
      if (event.key !== 'Escape') return
      setOpenPopover(null)
      const activeButton = openPopover === 'theme' ? themeButton : switcherButton
      activeButton.current?.focus()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [openPopover])

  const context = pathname.startsWith('/settings')
    ? 'Settings'
    : isRouteActive(pathname, '/reviews')
      ? 'Reviews'
      : pathname === '/onboarding'
        ? 'New Trail'
        : 'Trail'

  return (
    <header className="app-shell-header ui-app-header">
      <div className="app-shell-header-inner ui-header-inner">
        <div className="app-shell-topbar">
          <Link to="/" className="app-shell-brand" aria-label="Mastery Trail home">Mastery Trail</Link>
          <span className="app-shell-page-context">{context}</span>
          <button
            ref={themeButton}
            className="app-shell-theme-trigger"
            type="button"
            aria-label={openPopover === 'theme' ? 'Close theme switcher' : 'Open theme switcher'}
            aria-expanded={openPopover === 'theme'}
            aria-controls="theme-switcher-menu"
            onClick={() => setOpenPopover((open) => open === 'theme' ? null : 'theme')}
          >
            <span aria-hidden="true">◐</span>
          </button>
          <div id="theme-switcher-menu" className="app-shell-theme-menu" hidden={openPopover !== 'theme'}>
            <ThemeSwitcher variant="menu" themeId={theme.id} onChange={(id) => { selectTheme(id); setOpenPopover(null) }} />
          </div>
        </div>
        <nav className="app-shell-primary-nav" aria-label="Primary navigation">
          <div className="app-shell-nav-trail">
            <Link
              to="/"
              className="app-shell-nav-link"
              aria-current={isRouteActive(pathname, '/') ? 'page' : undefined}
            >
              Trail
            </Link>
            <button
              ref={switcherButton}
              className="app-shell-switcher-trigger"
              type="button"
              aria-label={openPopover === 'trail' ? 'Close Trail switcher' : 'Open Trail switcher'}
              aria-expanded={openPopover === 'trail'}
              aria-controls="trail-switcher-menu"
              onClick={() => setOpenPopover((open) => open === 'trail' ? null : 'trail')}
            >
              <span aria-hidden="true">⌄</span>
            </button>
            <div
              id="trail-switcher-menu"
              className="app-shell-switcher-menu"
              role="group"
              aria-label="Trail switcher options"
              hidden={openPopover !== 'trail'}
            >
              <Link to="/onboarding" onClick={() => setOpenPopover(null)}>New Trail</Link>
            </div>
          </div>
          <ReviewLink dueCount={dueCount} className="app-shell-nav-link" />
          <Link
            to="/settings"
            className="app-shell-nav-link"
            aria-current={isRouteActive(pathname, '/settings') ? 'page' : undefined}
          >
            Settings
          </Link>
          <Link to="/onboarding" className="app-shell-new-trail">New Trail</Link>
        </nav>
      </div>
    </header>
  )
}

export default function AppShell({ children }) {
  return <div className="app-shell">{children}</div>
}
