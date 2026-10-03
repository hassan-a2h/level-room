import { createContext, lazy, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { DEFAULT_THEME_ID } from './packContract.js'
import { applyThemeTokens, prepaintTheme, THEME_STORAGE_KEY } from './ThemePrepaint.js'
import { getTheme } from '../index.js'
import SceneSkeleton from './SceneSkeleton.jsx'

const SESSION_ONLY_MESSAGE = 'Applied for this session; browser storage is unavailable'
const ThemeContext = createContext({
  theme: getTheme(DEFAULT_THEME_ID),
  selectTheme: () => false,
  storageMessage: '',
})

export { ThemeContext, THEME_STORAGE_KEY }

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }) {
  const [selection, setSelection] = useState(() => prepaintTheme())

  useLayoutEffect(() => {
    if (selection.theme) applyThemeTokens(document.documentElement, selection.theme)
  }, [selection.theme])

  const selectTheme = useCallback((id) => {
    const theme = getTheme(id)
    if (!theme) return false
    let storageMessage = SESSION_ONLY_MESSAGE
    try {
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, theme.id)
      storageMessage = 'Saved in this browser'
    } catch {
      // The in-memory selection remains available for this session.
    }
    setSelection({ theme, message: storageMessage })
    return true
  }, [])

  useEffect(() => {
    if (typeof globalThis.addEventListener !== 'function') return undefined
    const handleStorage = (event) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== 'mastery-roadmap-theme') return
      const nextTheme = event.newValue ? getTheme(event.newValue) : getTheme(DEFAULT_THEME_ID)
      if (!nextTheme) return
      setSelection({ theme: nextTheme, message: event.newValue ? 'Updated from another tab' : '' })
    }
    globalThis.addEventListener('storage', handleStorage)
    return () => globalThis.removeEventListener('storage', handleStorage)
  }, [])

  const value = useMemo(() => ({
    theme: selection.theme ?? getTheme(DEFAULT_THEME_ID),
    selectTheme,
    storageMessage: selection.message,
  }), [selection, selectTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemeView(name) {
  const { theme } = useTheme()
  const loader = theme?.viewLoaders?.[name]
  if (!loader) throw new Error(`Theme view "${name}" is not available in ${theme?.id ?? 'the active theme'}`)
  return lazyView(theme.id, name, loader)
}

const lazyViews = new Map()
function lazyView(themeId, name, loader) {
  const key = `${themeId}:${name}`
  if (!lazyViews.has(key)) lazyViews.set(key, lazy(loader))
  return lazyViews.get(key)
}

export { SceneSkeleton }
export default ThemeProvider
