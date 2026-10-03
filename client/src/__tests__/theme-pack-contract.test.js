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
  mode: id.endsWith('dusk') || id.endsWith('ocean') || id.endsWith('lavender') || id.endsWith('evening') || id.endsWith('night') || id.endsWith('twilight') || id.endsWith('calm') || id === 'midnight-ink' ? 'dark' : 'light',
  familyId: 'fixture-family',
  pairedThemeId: id,
  tagline: 'A useful tagline',
  previewAsset: '/assets/preview.webp',
  tokens: Object.fromEntries(REQUIRED_TOKEN_KEYS.map((key) => [key, key.startsWith('radius') || key.startsWith('motion') ? '1rem' : '#123456'])),
  artwork: {},
  viewLoaders: Object.fromEntries(THEME_VIEW_NAMES.map((name) => [name, () => Promise.resolve({ default: () => null })])),
})

describe('theme pack contract', () => {
  it('locks all sixteen theme IDs and Morning Mist default', () => {
    expect(REQUIRED_THEME_IDS).toHaveLength(16)
    expect(REQUIRED_THEME_IDS).toContain('morning-mist')
    expect(REQUIRED_THEME_IDS).toContain('midnight-ink')
    expect(DEFAULT_THEME_ID).toBe('morning-mist')
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
      [{ ...completePack('morning-mist'), mode: 'invalid' }, /mode/],
      [(() => { const pack = completePack('morning-mist'); delete pack.id; return pack })(), /id/],
      [{ ...completePack('morning-mist'), tokens: Object.fromEntries(REQUIRED_TOKEN_KEYS.filter((key) => key !== 'ink').map((key) => [key, '#123456'])) }, /tokens\.ink/],
      [{ ...completePack('morning-mist'), tokens: { ...completePack('morning-mist').tokens, ink: '' } }, /tokens\.ink/],
      [{ ...completePack('morning-mist'), viewLoaders: { ...completePack('morning-mist').viewLoaders, TrailView: null } }, /viewLoaders\.TrailView/],
    ]

    for (const [pack, message] of invalidCases) {
      expect(() => validateThemePack(pack)).toThrow(message)
    }
  })
})
