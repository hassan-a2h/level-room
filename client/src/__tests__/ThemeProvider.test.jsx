import { useContext } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeContext, ThemeProvider, THEME_STORAGE_KEY } from '../theme/ThemeProvider.jsx'

function Probe() {
  const { theme, selectTheme, storageMessage } = useContext(ThemeContext)
  return (
    <div>
      <span>{theme.name}</span>
      <span role="status">{storageMessage}</span>
      <button onClick={() => selectTheme('deep-ocean')}>Set dark</button>
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-theme-mode')
  document.documentElement.style.cssText = ''
})

describe('ThemeProvider', () => {
  it('starts with Morning Mist and applies semantic tokens and native control mode', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByText('Morning Mist')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-theme', 'morning-mist')
    expect(document.documentElement).toHaveAttribute('data-theme-mode', 'light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--ui-canvas')).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('loads a valid saved choice and falls back for unknown stored values', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'deep-ocean')
    const first = render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByText('Deep Ocean')).toBeInTheDocument()
    first.unmount()

    window.localStorage.setItem(THEME_STORAGE_KEY, 'not-a-real-theme')
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByText('Morning Mist')).toBeInTheDocument()
  })

  it('applies a choice immediately and persists it for this browser profile', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Set dark' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'deep-ocean')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('deep-ocean')
    expect(screen.getByRole('status')).toHaveTextContent('Saved in this browser')
  })

  it('stays usable and reports session-only selection when storage read or write fails', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('denied') })
    render(<ThemeProvider><Probe /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Set dark' }))
    expect(screen.getByText('Deep Ocean')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Applied for this session; browser storage is unavailable')
  })
})
