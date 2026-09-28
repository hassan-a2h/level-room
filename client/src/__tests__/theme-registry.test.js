import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_ID, getTheme, THEME_IDS } from '../theme/index.js'
import { THEME_VIEW_NAMES } from '../theme/core/packContract.js'

describe('production theme registry', () => {
  it('contains only the three contracted packs and defaults to Living Atlas', () => {
    expect(THEME_IDS).toEqual(['living-atlas', 'curiosity-engine', 'mission-workshop'])
    expect(DEFAULT_THEME_ID).toBe('living-atlas')
    expect(getTheme('living-atlas').mode).toBe('light')
    expect(getTheme('curiosity-engine').mode).toBe('light')
    expect(getTheme('mission-workshop').mode).toBe('dark')
    expect(getTheme('morning-mist')).toBeUndefined()
  })

  it('provides lazy loaders for every view in every pack', async () => {
    for (const id of THEME_IDS) {
      const pack = getTheme(id)
      expect(Object.keys(pack.viewLoaders)).toEqual(THEME_VIEW_NAMES)
      for (const name of THEME_VIEW_NAMES) {
        const module = await pack.viewLoaders[name]()
        expect(typeof module.default).toBe('function')
      }
    }
  })
})
