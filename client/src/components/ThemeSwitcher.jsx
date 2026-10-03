import { getTheme, resolveThemeId, THEME_FAMILIES, THEMES } from '../theme/index.js'
import { getThemeArt } from '../assets/themes/manifest.js'
import { useTheme } from '../theme/ThemeProvider.jsx'

function ThemeSwatches({ theme }) {
  const art = getThemeArt(theme.id) ?? getThemeArt(theme.artPackId) ?? getThemeArt('living-atlas')
  return (
    <span className="theme-card-preview">
      {art ? <img src={art.trail.src} alt={`${theme.name} preview`} loading="lazy" /> : null}
      <span className="theme-card-swatches" aria-hidden="true">
        {[theme.tokens.canvas, theme.tokens.panel, theme.tokens.primary, theme.tokens.secondary].map((color) => (
          <span key={color} style={{ backgroundColor: color }} />
        ))}
      </span>
    </span>
  )
}

export default function ThemeSwitcher({ variant = 'cards', themeId: controlledThemeId, value, themes: themeOptions = THEMES, onChange, className = '' }) {
  const { theme, selectTheme, storageMessage } = useTheme()
  const selectedId = value ?? controlledThemeId ?? theme.id
  const themes = Array.isArray(themeOptions) ? themeOptions : THEMES
  const selected = themes.find((item) => item.id === (resolveThemeId(selectedId) ?? selectedId)) ?? theme
  const change = (id) => {
    if (onChange) onChange(id)
    else selectTheme(id)
  }

  if (variant === 'menu') {
    return (
      <label className={`theme-switcher theme-switcher--menu ${className}`.trim()}>
        <span className="theme-switcher__label">Theme</span>
        <select aria-label="Theme" value={selected.id} onChange={(event) => change(event.target.value)}>
          {THEME_FAMILIES.map((family) => {
            const options = themes.filter((item) => item.familyId === family.id)
            return options.length ? <optgroup key={family.id} label={family.name}>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup> : null
          })}
          <optgroup label="Previously saved" hidden>
            {['living-atlas', 'curiosity-engine', 'mission-workshop'].map((id) => <option key={id} value={id}>{getTheme(id).name}</option>)}
          </optgroup>
        </select>
      </label>
    )
  }

  const families = THEME_FAMILIES.map((family) => ({
    ...family,
    options: [family.lightId, family.darkId].map((id) => themes.find((item) => item.id === id)).filter(Boolean),
  })).filter(({ options }) => options.length)

  return (
    <div className={`theme-switcher theme-switcher--cards ${className}`.trim()}>
      <p className="text-sm ui-text-secondary">Choose a visual style for your learning space.</p>
      <p role="status" aria-live="polite" className="text-sm ui-text-muted">
        {storageMessage || 'Your theme applies immediately and is saved in this browser when you choose it.'}
      </p>
      <fieldset className="theme-switcher__options">
        <legend className="sr-only">Appearance themes</legend>
        <div className="theme-switcher__families grid grid-cols-1 sm:grid-cols-2 gap-4">
          {families.map((family) => {
            const paired = getTheme(selected.pairedThemeId)
            const pairIsAvailable = paired && family.options.some((item) => item.id === paired.id)
            return (
              <section key={family.id} className="theme-family" aria-labelledby={`theme-family-${family.id}`}>
                <div className="theme-family__heading">
                  <h3 id={`theme-family-${family.id}`}>{family.name}</h3>
                  {selected.familyId === family.id && pairIsAvailable ? (
                    <button type="button" className="theme-family__pair-switch" onClick={() => change(paired.id)}>
                      Use {paired.mode === 'dark' ? 'dark' : 'light'} mode
                    </button>
                  ) : null}
                </div>
                <div className="theme-family__options grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {family.options.map((item) => (
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
                        <span className="text-xs ui-text-muted">{item.mode === 'dark' ? 'Dark' : 'Light'} · {item.tagline}</span>
                      </span>
                      <span className="theme-card-selected" aria-hidden="true">{selected.id === item.id ? 'Selected' : ''}</span>
                    </label>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}
