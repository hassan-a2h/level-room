import { DEFAULT_THEME_ID } from './packContract.js'
import { compatibilityTokens, tokenName } from '../tokens.js'
import { THEMES } from '../index.js'

export const THEME_STORAGE_KEY = 'mastery-trail-theme-v2'
const LEGACY_THEME_STORAGE_KEY = 'mastery-roadmap-theme'

export function applyThemeTokens(root, theme) {
  root.dataset.theme = theme.id
  root.dataset.themeMode = theme.mode
  root.style.colorScheme = theme.mode
  for (const [name, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(`--${tokenName(name)}`, value)
  }
  for (const [name, token] of Object.entries(compatibilityTokens)) {
    if (theme.tokens[token]) root.style.setProperty(`--${name}`, theme.tokens[token])
  }
}

export function prepaintTheme({ root, storage, packs, storageKey = THEME_STORAGE_KEY } = {}) {
  const target = root ?? globalThis.document?.documentElement
  const available = packs ?? THEMES
  const fallback = available.find((theme) => theme.id === DEFAULT_THEME_ID)
  let theme = fallback
  let message = ''
  try {
    const source = storage ?? globalThis.localStorage
    let storedId = source.getItem(storageKey)
    if (storageKey === THEME_STORAGE_KEY) {
      const legacyValue = source.getItem(LEGACY_THEME_STORAGE_KEY)
      if (storedId === null && legacyValue !== null) {
        storedId = DEFAULT_THEME_ID
        source.setItem(storageKey, DEFAULT_THEME_ID)
      }
      if (legacyValue !== null) source.removeItem(LEGACY_THEME_STORAGE_KEY)
    }
    theme = available.find((candidate) => candidate.id === storedId) ?? fallback
    if (theme && storedId === theme.id) message = 'Saved in this browser'
    if (storedId && !available.some((candidate) => candidate.id === storedId)) {
      theme = fallback
    }
  } catch {
    message = 'Applied for this session; browser storage is unavailable'
  }
  if (target && theme) applyThemeTokens(target, theme)
  return { theme, message }
}
