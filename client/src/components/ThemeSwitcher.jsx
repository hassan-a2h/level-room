import { THEMES } from '../theme/index.js'
import { getThemeArt } from '../assets/themes/manifest.js'
import { useTheme } from '../theme/ThemeProvider.jsx'

function ThemeSwatches({ theme }) {
  return (
    <span className="theme-card-preview">
      <img src={getThemeArt(theme.id).trail.src} alt={`${theme.name} preview`} loading="lazy" />
      <span className="theme-card-swatches" aria-hidden="true">
        {[theme.tokens.canvas, theme.tokens.panel, theme.tokens.primary, theme.tokens.secondary].map((color) => (
          <span key={color} style={{ backgroundColor: color }} />
        ))}
      </span>
    </span>
  )
}

export default function ThemeSwitcher({ variant = 'cards', themeId: controlledThemeId, onChange, className = '' }) {
  const { theme, selectTheme, storageMessage } = useTheme()
  const selectedId = controlledThemeId ?? theme.id
  const selected = THEMES.find((item) => item.id === selectedId) ?? theme
  const change = (id) => {
    if (onChange) onChange(id)
    else selectTheme(id)
  }

  if (variant === 'menu') {
    return (
      <label className={`theme-switcher theme-switcher--menu ${className}`.trim()}>
        <span className="theme-switcher__label">Theme</span>
        <select aria-label="Theme" value={selected.id} onChange={(event) => change(event.target.value)}>
          {THEMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
    )
  }

  return (
    <div className={`theme-switcher theme-switcher--cards ${className}`.trim()}>
      <p className="text-sm ui-text-secondary">Choose a visual style for your learning space.</p>
      <p role="status" aria-live="polite" className="text-sm ui-text-muted">
        {storageMessage || 'Your theme applies immediately and is saved in this browser when you choose it.'}
      </p>
      <fieldset className="theme-switcher__options">
        <legend className="sr-only">Appearance themes</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {THEMES.map((item) => (
            <label key={item.id} className={`theme-card ${selected.id === item.id ? 'is-selected' : ''}`}>
              <input
                className="sr-only"
                type="radio"
                name="appearance-theme"
                value={item.id}
                checked={selected.id === item.id}
                onChange={() => change(item.id)}
              />
              <ThemeSwatches theme={item} />
              <span className="theme-card-copy">
                <span>{item.name}</span>
                <span className="text-xs ui-text-muted">{item.tagline}</span>
              </span>
              <span className="theme-card-selected" aria-hidden="true">{selected.id === item.id ? 'Selected' : ''}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
