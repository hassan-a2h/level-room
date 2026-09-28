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
      <button onClick={() => selectTheme('mission-workshop')}>Set dark</button>
      <button onClick={() => selectTheme('not-a-real-theme')}>Set invalid</button>
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
  it('starts with Living Atlas and applies semantic tokens and native control mode', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByText('Living Atlas')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-theme', 'living-atlas')
    expect(document.documentElement).toHaveAttribute('data-theme-mode', 'light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--canvas')).toBeTruthy()
    expect(document.documentElement.style.getPropertyValue('--font-body')).toBeTruthy()
  })

  it('loads a valid saved choice and falls back for unknown stored values', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'mission-workshop')
    const first = render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByText('Mission Workshop')).toBeInTheDocument()
    first.unmount()

    window.localStorage.setItem(THEME_STORAGE_KEY, 'morning-mist')
    const second = render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByText('Living Atlas')).toBeInTheDocument()
    second.unmount()

    window.localStorage.setItem(THEME_STORAGE_KEY, 'unknown-theme')
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByText('Living Atlas')).toBeInTheDocument()
  })

  it('applies a choice immediately and persists it for this browser profile', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Set dark' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'mission-workshop')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('mission-workshop')
    expect(screen.getByRole('status')).toHaveTextContent('Saved in this browser')
  })

  it('stays usable and reports session-only selection when storage read or write fails', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('denied') })
    render(<ThemeProvider><Probe /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Set dark' }))
    expect(screen.getByText('Mission Workshop')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Applied for this session; browser storage is unavailable')
  })

  it('ignores invalid theme selections', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Set dark' }))
    fireEvent.click(screen.getByRole('button', { name: 'Set invalid' }))
    expect(screen.getByText('Mission Workshop')).toBeInTheDocument()
  })
})
