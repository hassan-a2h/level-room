import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
  it('runs the literal inline prepaint script before module scripts and allowlists saved IDs', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    expect(inlineScript).toBeTruthy()
    const scriptIndex = html.indexOf('<script>')
    expect(scriptIndex).toBeLessThan(html.indexOf('type="module"'))
    const stylesheetIndex = html.indexOf('rel="stylesheet"')
    if (stylesheetIndex >= 0) expect(scriptIndex).toBeLessThan(stylesheetIndex)

    for (const [storedId, expectedId, expectedMode] of [
      ['forest-dusk', 'forest-dusk', 'dark'],
      ['unknown-theme', 'morning-mist', 'light'],
      [null, 'morning-mist', 'light'],
    ]) {
      const htmlDocument = document.implementation.createHTMLDocument()
      new Function('document', 'localStorage', inlineScript)(htmlDocument, {
        getItem: () => storedId,
      })
      expect(htmlDocument.documentElement.dataset.theme).toBe(expectedId)
      expect(htmlDocument.documentElement.style.colorScheme).toBe(expectedMode)
    }

    const deniedDocument = document.implementation.createHTMLDocument()
    new Function('document', 'localStorage', inlineScript)(deniedDocument, {
      getItem() { throw new Error('denied') },
    })
    expect(deniedDocument.documentElement.dataset.theme).toBe('morning-mist')
  })

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
    expect(prepaintTheme({ root: staleRoot, storage: { getItem: () => 'retired-theme' } }).theme.id).toBe('morning-mist')
    const deniedRoot = createRoot()
    const result = prepaintTheme({ root: deniedRoot, packs: THEMES, storage: { getItem() { throw new Error('denied') } } })
    expect(result.theme.id).toBe('morning-mist')
    expect(result.message).toMatch(/session/i)
  })

  it('writes Living Atlas to the versioned key when the legacy key is present and removes it', () => {
    const root = createRoot()
    const values = new Map([['mastery-roadmap-theme', 'palette-purple']])
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    }

    expect(prepaintTheme({ root, storage }).theme.id).toBe('morning-mist')
    expect(values.get(THEME_STORAGE_KEY)).toBe('morning-mist')
    expect(values.has('mastery-roadmap-theme')).toBe(false)
  })

  it('removes the legacy key when the new key already contains a valid selection', () => {
    const root = createRoot()
    const values = new Map([[THEME_STORAGE_KEY, 'mission-workshop'], ['mastery-roadmap-theme', 'palette-purple']])
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    }

    expect(prepaintTheme({ root, storage }).theme.id).toBe('mission-workshop')
    expect(values.get(THEME_STORAGE_KEY)).toBe('mission-workshop')
    expect(values.has('mastery-roadmap-theme')).toBe(false)
  })
})
