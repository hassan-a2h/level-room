import { describe, expect, it } from 'vitest'
import { THEMES } from '../theme/index.js'
import { prepaintTheme, THEME_STORAGE_KEY } from '../theme/core/ThemePrepaint.js'

function createRoot() {
  return {
    dataset: {},
    style: {
      colorScheme: '',
      values: {},
      setProperty(name, value) { this.values[name] = value },
    },
  }
}

describe('ThemePrepaint', () => {
  it('synchronously paints the saved theme using the versioned storage key', () => {
    const root = createRoot()
    const result = prepaintTheme({ root, storage: { getItem: (key) => key === THEME_STORAGE_KEY ? 'mission-workshop' : null } })
    expect(result.theme.id).toBe('mission-workshop')
    expect(root.dataset).toEqual({ theme: 'mission-workshop', themeMode: 'dark' })
    expect(root.style.colorScheme).toBe('dark')
    expect(root.style.values['--font-body']).toBeTruthy()
  })

  it('falls back for stale IDs and storage denial, while reporting session-only use', () => {
    const staleRoot = createRoot()
    expect(prepaintTheme({ root: staleRoot, storage: { getItem: () => 'morning-mist' } }).theme.id).toBe('living-atlas')
    const deniedRoot = createRoot()
    const result = prepaintTheme({ root: deniedRoot, packs: THEMES, storage: { getItem() { throw new Error('denied') } } })
    expect(result.theme.id).toBe('living-atlas')
    expect(result.message).toMatch(/session/i)
  })
})
