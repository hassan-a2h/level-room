import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME_ID,
  REQUIRED_THEME_IDS,
  REQUIRED_TOKEN_KEYS,
  THEME_VIEW_NAMES,
  validateThemePack,
} from '../theme/core/packContract.js'

const completePack = (id) => ({
  id,
  name: id,
  mode: id === 'mission-workshop' ? 'dark' : 'light',
  tagline: 'A useful tagline',
  previewAsset: '/assets/preview.webp',
  tokens: Object.fromEntries(REQUIRED_TOKEN_KEYS.map((key) => [key, key.startsWith('radius') || key.startsWith('motion') ? '1rem' : '#123456'])),
  artwork: {},
  viewLoaders: Object.fromEntries(THEME_VIEW_NAMES.map((name) => [name, () => Promise.resolve({ default: () => null })])),
})

describe('theme pack contract', () => {
  it('locks the three theme IDs and Living Atlas default', () => {
    expect(REQUIRED_THEME_IDS).toEqual(['living-atlas', 'curiosity-engine', 'mission-workshop'])
    expect(DEFAULT_THEME_ID).toBe('living-atlas')
    expect(Object.isFrozen(REQUIRED_THEME_IDS)).toBe(true)
    expect(Object.isFrozen(REQUIRED_TOKEN_KEYS)).toBe(true)
    expect(Object.isFrozen(THEME_VIEW_NAMES)).toBe(true)
  })

  it('accepts complete light and dark fixture packs without a production registry', () => {
    for (const id of REQUIRED_THEME_IDS) {
      expect(() => validateThemePack(completePack(id))).not.toThrow()
    }
  })

  it('rejects unknown IDs, invalid modes, missing metadata, tokens, and view loaders', () => {
    const invalidCases = [
      [{ ...completePack('unknown-theme') }, /id/],
      [{ ...completePack('living-atlas'), mode: 'dark' }, /mode/],
      [(() => { const pack = completePack('living-atlas'); delete pack.id; return pack })(), /id/],
      [{ ...completePack('living-atlas'), tokens: Object.fromEntries(REQUIRED_TOKEN_KEYS.filter((key) => key !== 'ink').map((key) => [key, '#123456'])) }, /tokens\.ink/],
      [{ ...completePack('living-atlas'), tokens: { ...completePack('living-atlas').tokens, ink: '' } }, /tokens\.ink/],
      [{ ...completePack('living-atlas'), viewLoaders: { ...completePack('living-atlas').viewLoaders, TrailView: null } }, /viewLoaders\.TrailView/],
    ]

    for (const [pack, message] of invalidCases) {
      expect(() => validateThemePack(pack)).toThrow(message)
    }
  })
})
