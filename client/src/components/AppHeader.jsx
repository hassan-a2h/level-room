import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const destinations = [
  { label: 'Dashboard', to: '/' },
  { label: 'New Topic', to: '/onboarding' },
  { label: 'Reviews', to: '/reviews' },
  { label: 'Settings', to: '/settings' },
  { label: 'Appearance', to: '/settings#appearance' },
]

export default function AppHeader({ variant = 'standard', dueCount, title, returnTo = '/', returnLabel = 'Dashboard', detail, onReturn }) {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef(null)
  const focusMode = variant === 'focus'

  useEffect(() => {
    if (!menuOpen) return undefined
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButton.current?.focus()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  if (focusMode) {
    return (
      <header className="ui-app-header ui-focus-header">
        <div className="ui-header-inner">
          {onReturn ? (
            <button className="ui-header-back" type="button" onClick={onReturn} aria-label={`Back to ${returnLabel}`}>
              <span aria-hidden="true">←</span> Back to {returnLabel}
            </button>
          ) : (
            <Link className="ui-header-back" to={returnTo} aria-label={`Back to ${returnLabel}`}>
              <span aria-hidden="true">←</span> Back to {returnLabel}
            </Link>
          )}
          <div className="ui-header-context">
            <h1>{title}</h1>
            {detail && <p>{detail}</p>}
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="ui-app-header" data-menu-open={menuOpen}>
      <div className="ui-header-inner">
        <Link to="/" className="ui-brand" aria-label="Mastery Roadmap home">Mastery Roadmap</Link>
        <button
          ref={menuButton}
          type="button"
          className="ui-header-menu-toggle"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">{menuOpen ? 'Close' : 'Menu'}</span>
        </button>
        <nav id="primary-navigation" className="ui-header-nav" aria-label="Primary navigation">
          {destinations.map(({ label, to }) => {
            const path = to.split('#')[0]
            const active = label === 'Appearance'
              ? location.pathname === '/settings' && location.hash === '#appearance'
              : label === 'Settings'
                ? location.pathname === '/settings' && location.hash !== '#appearance'
                : path === '/'
              ? location.pathname === '/'
              : location.pathname === path || location.pathname.startsWith(`${path}/`)
            const accessibleLabel = label === 'Reviews' && Number.isFinite(dueCount) && dueCount > 0
              ? `Reviews, ${dueCount} due`
              : label
            return (
              <Link
                key={label}
                to={to}
                className="ui-header-link"
                aria-current={active ? 'page' : undefined}
                aria-label={accessibleLabel}
                onClick={() => setMenuOpen(false)}
              >
                {label}
                {label === 'Reviews' && Number.isFinite(dueCount) && dueCount > 0 && <span className="ui-header-count">{dueCount}</span>}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
