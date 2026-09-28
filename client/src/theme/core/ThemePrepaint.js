import { DEFAULT_THEME_ID } from './packContract.js'
import { compatibilityTokens, tokenName } from '../tokens.js'
import { THEMES } from '../index.js'

export const THEME_STORAGE_KEY = 'mastery-trail-theme-v2'

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
    const storedId = source.getItem(storageKey)
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
