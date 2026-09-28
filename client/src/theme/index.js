import livingAtlas from './packs/living-atlas/pack.js'
import curiosityEngine from './packs/curiosity-engine/pack.js'
import missionWorkshop from './packs/mission-workshop/pack.js'
import { DEFAULT_THEME_ID, validateThemePack } from './core/packContract.js'

export const THEMES = Object.freeze([livingAtlas, curiosityEngine, missionWorkshop].map(validateThemePack))
export const THEME_IDS = Object.freeze(THEMES.map(({ id }) => id))
const themesById = new Map(THEMES.map((theme) => [theme.id, theme]))

export { DEFAULT_THEME_ID }

export function getTheme(id) {
  return themesById.get(id)
}
