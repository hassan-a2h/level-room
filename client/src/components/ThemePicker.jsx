import { THEMES } from '../theme/themes.js'
import { useTheme } from '../theme/ThemeProvider.jsx'

const groups = [
  { mode: 'light', label: 'Light themes' },
  { mode: 'dark', label: 'Dark themes' },
]

export default function ThemePicker() {
  const { theme, selectTheme, storageMessage } = useTheme()
  return (
    <div className="space-y-5">
      <p className="text-sm ui-text-secondary">Choose a peaceful color palette.</p>
      <p role="status" aria-live="polite" className="text-sm ui-text-muted">
        {storageMessage || 'Your theme applies immediately and is saved in this browser when you choose it.'}
      </p>
      {groups.map((group) => (
        <fieldset key={group.mode} className="space-y-3">
          <legend className="text-sm font-semibold ui-text">{group.label}</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {THEMES.filter((item) => item.mode === group.mode).map((item) => (
              <label key={item.id} className={`theme-card ${theme.id === item.id ? 'is-selected' : ''}`}>
                <input
                  className="sr-only"
                  type="radio"
                  name="appearance-theme"
                  value={item.id}
                  checked={theme.id === item.id}
                  onChange={() => selectTheme(item.id)}
                />
                <span className="theme-card-swatches" aria-hidden="true">
                  {[item.tokens.canvas, item.tokens.surface, item.tokens.action].map((color) => (
                    <span key={color} style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span className="theme-card-copy">
                  <span className="font-medium ui-text">{item.name}</span>
                  <span className="text-xs ui-text-muted">{item.mode === 'dark' ? 'Dark' : 'Light'} palette</span>
                </span>
                <span className="theme-card-selected" aria-hidden="true">{theme.id === item.id ? 'Selected' : ''}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button type="button" className="ui-button ui-button-secondary" onClick={() => selectTheme('morning-mist')}>
        Use Morning Mist
      </button>
    </div>
  )
}
