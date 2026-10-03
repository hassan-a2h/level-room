import livingAtlas from './packs/living-atlas/pack.js'
import curiosityEngine from './packs/curiosity-engine/pack.js'
import missionWorkshop from './packs/mission-workshop/pack.js'
import { DEFAULT_THEME_ID, validateThemePack } from './core/packContract.js'
import { createThemeTokens, THEME_ALIASES, THEME_CATALOG, THEME_FAMILIES } from './catalog.js'

const BASE_PACKS = Object.freeze({
  'living-atlas': livingAtlas,
  'curiosity-engine': curiosityEngine,
  'mission-workshop': missionWorkshop,
})

function createThemePack(entry) {
  const base = BASE_PACKS[entry.basePackId]
  return validateThemePack({
    ...base,
    id: entry.id,
    name: entry.name,
    mode: entry.mode,
    familyId: entry.familyId,
    pairedThemeId: entry.pairedThemeId,
    tagline: `${entry.familyName} ${entry.mode === 'dark' ? 'dark' : 'light'} · ${base.tagline}`,
    tokens: createThemeTokens(entry),
    artPackId: entry.basePackId,
  })
}

export const THEMES = Object.freeze(THEME_CATALOG.map(createThemePack))
export const THEME_IDS = Object.freeze(THEMES.map(({ id }) => id))
const themesById = new Map(THEMES.map((theme) => [theme.id, theme]))
const LEGACY_NAMES = Object.freeze({
  'living-atlas': 'Living Atlas',
  'curiosity-engine': 'Curiosity Engine',
  'mission-workshop': 'Mission Workshop',
})
const legacyThemesById = new Map(Object.entries(THEME_ALIASES).map(([legacyId, canonicalId]) => {
  const theme = themesById.get(canonicalId)
  return [legacyId, Object.freeze({ ...theme, id: legacyId, name: LEGACY_NAMES[legacyId], canonicalId })]
}))

export { DEFAULT_THEME_ID, THEME_FAMILIES }

export function getTheme(id) {
  return themesById.get(id) ?? legacyThemesById.get(id)
}

export function resolveThemeId(id) {
  return getTheme(id)?.canonicalId ?? getTheme(id)?.id
}
