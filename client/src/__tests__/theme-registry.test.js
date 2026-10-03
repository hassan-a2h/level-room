import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_ID, getTheme, THEME_IDS } from '../theme/index.js'
import { THEME_VIEW_NAMES } from '../theme/core/packContract.js'

describe('production theme registry', () => {
  it('contains all eight paired families and defaults to Morning Mist', () => {
    expect(THEME_IDS).toEqual([
      'morning-mist', 'forest-dusk', 'blue-harbor', 'deep-ocean', 'lavender-still', 'night-lavender',
      'warm-sand', 'cocoa-evening', 'sage-garden', 'moss-night', 'rosewater', 'plum-twilight',
      'quiet-linen', 'graphite-calm', 'sea-glass', 'midnight-ink',
    ])
    expect(DEFAULT_THEME_ID).toBe('morning-mist')
    expect(getTheme('morning-mist').mode).toBe('light')
    expect(getTheme('forest-dusk').mode).toBe('dark')
    expect(getTheme('mission-workshop').id).toBe('mission-workshop')
    expect(getTheme('mission-workshop').canonicalId).toBe('forest-dusk')
    expect(getTheme('retired-theme')).toBeUndefined()
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
