import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ThemeProvider } from '../theme/ThemeProvider.jsx'
import ThemeSwitcher from '../components/ThemeSwitcher.jsx'

afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals() })

function RouteWithDraft() {
  const location = useLocation()
  return (
    <>
      <input aria-label="Unsaved draft" defaultValue="first draft" />
      <output>{location.pathname}{location.search}</output>
      <ThemeSwitcher variant="cards" />
    </>
  )
}

describe('ThemeSwitcher', () => {
  it('shows the three themes as accessible cards and applies the selected pack', () => {
    render(<ThemeProvider><ThemeSwitcher variant="cards" /></ThemeProvider>)
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /Living Atlas/ })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /Mission Workshop/ }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'mission-workshop')
    expect(screen.getByRole('radio', { name: /Mission Workshop/ })).toBeChecked()
  })

  it('offers a compact menu variant for constrained header layouts', () => {
    render(<ThemeProvider><ThemeSwitcher variant="menu" /></ThemeProvider>)
    fireEvent.change(screen.getByRole('combobox', { name: 'Theme' }), { target: { value: 'curiosity-engine' } })
    expect(document.documentElement).toHaveAttribute('data-theme', 'curiosity-engine')
  })

  it('changes theme without making a network request', () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    render(<ThemeProvider><ThemeSwitcher variant="cards" /></ThemeProvider>)
    fireEvent.click(screen.getByRole('radio', { name: /Curiosity Engine/ }))
    expect(request).not.toHaveBeenCalled()
  })

  it('preserves the current route and unsaved input while switching themes', () => {
    render(<ThemeProvider><MemoryRouter initialEntries={['/settings?tab=appearance']}><RouteWithDraft /></MemoryRouter></ThemeProvider>)
    fireEvent.change(screen.getByRole('textbox', { name: 'Unsaved draft' }), { target: { value: 'unsaved answer' } })
    fireEvent.click(screen.getByRole('radio', { name: /Curiosity Engine/ }))
    expect(screen.getByRole('textbox', { name: 'Unsaved draft' })).toHaveValue('unsaved answer')
    expect(screen.getByText('/settings?tab=appearance')).toBeInTheDocument()
  })
})
