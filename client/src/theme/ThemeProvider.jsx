import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react'
import { DEFAULT_THEME_ID, getTheme } from './themes.js'

export const THEME_STORAGE_KEY = 'mastery-roadmap-theme'
const SESSION_ONLY_MESSAGE = 'Applied for this session; browser storage is unavailable'

function readInitialTheme() {
  try {
    const id = window.localStorage.getItem(THEME_STORAGE_KEY)
    return { theme: getTheme(id) || getTheme(DEFAULT_THEME_ID), message: id && getTheme(id) ? 'Saved in this browser' : '' }
  } catch {
    return { theme: getTheme(DEFAULT_THEME_ID), message: '' }
  }
}

function applyTheme(theme) {
  const root = document.documentElement
  root.dataset.theme = theme.id
  root.dataset.themeMode = theme.mode
  root.style.colorScheme = theme.mode
  for (const [name, value] of Object.entries(theme.tokens)) {
    const tokenName = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^space(\d+)$/, 'space-$1')
    root.style.setProperty(`--${tokenName}`, value)
  }
}

export const ThemeContext = createContext({
  theme: getTheme(DEFAULT_THEME_ID),
  selectTheme: () => false,
  storageMessage: '',
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }) {
  const [selection, setSelection] = useState(readInitialTheme)

  useLayoutEffect(() => {
    applyTheme(selection.theme)
  }, [selection.theme])

  const selectTheme = useCallback((id) => {
    const theme = getTheme(id)
    if (!theme) return false
    let message = SESSION_ONLY_MESSAGE
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, id)
      message = 'Saved in this browser'
    } catch {
      // Keep the selection active in memory when browser storage is denied.
    }
    setSelection({ theme, message })
    return true
  }, [])

  const value = useMemo(() => ({
    theme: selection.theme,
    selectTheme,
    storageMessage: selection.message,
  }), [selection, selectTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export default ThemeProvider
