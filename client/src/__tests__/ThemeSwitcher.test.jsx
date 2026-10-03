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
  it('shows all sixteen themes in paired family cards and applies the selected theme', () => {
    render(<ThemeProvider><ThemeSwitcher variant="cards" /></ThemeProvider>)
    expect(screen.getAllByRole('radio')).toHaveLength(16)
    expect(screen.getAllByRole('region')).toHaveLength(8)
    expect(screen.getByRole('radio', { name: /Morning Mist/ })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /Forest Dusk/ }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'forest-dusk')
    expect(screen.getByRole('radio', { name: /Forest Dusk/ })).toBeChecked()
  })

  it('offers a compact menu variant for constrained header layouts', () => {
    render(<ThemeProvider><ThemeSwitcher variant="menu" /></ThemeProvider>)
    fireEvent.change(screen.getByRole('combobox', { name: 'Theme' }), { target: { value: 'blue-harbor' } })
    expect(document.documentElement).toHaveAttribute('data-theme', 'blue-harbor')
  })

  it('changes theme without making a network request', () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    render(<ThemeProvider><ThemeSwitcher variant="cards" /></ThemeProvider>)
    fireEvent.click(screen.getByRole('radio', { name: /Blue Harbor/ }))
    expect(request).not.toHaveBeenCalled()
  })

  it('preserves the current route and unsaved input while switching themes', () => {
    render(<ThemeProvider><MemoryRouter initialEntries={['/settings?tab=appearance']}><RouteWithDraft /></MemoryRouter></ThemeProvider>)
    fireEvent.change(screen.getByRole('textbox', { name: 'Unsaved draft' }), { target: { value: 'unsaved answer' } })
    fireEvent.click(screen.getByRole('radio', { name: /Blue Harbor/ }))
    expect(screen.getByRole('textbox', { name: 'Unsaved draft' })).toHaveValue('unsaved answer')
    expect(screen.getByText('/settings?tab=appearance')).toBeInTheDocument()
  })
})
