import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../theme/ThemeProvider.jsx'
import SettingsPage from '../../pages/SettingsPage.jsx'

const themes = ['living-atlas', 'curiosity-engine', 'mission-workshop']

describe('settings theme parity', () => {
  beforeEach(() => {
    window.localStorage.clear()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ provider: null, model: null, apiKeySet: false, envStatus: [], providers: [] }),
    })
  })

  it.each(themes)('%s keeps the same categories, theme controls, and accessible settings surface', async (themeId) => {
    window.localStorage.setItem('mastery-trail-theme-v2', themeId)
    render(
      <ThemeProvider>
        <MemoryRouter>
          <Suspense fallback={<div role="status">Loading settings…</div>}><SettingsPage /></Suspense>
        </MemoryRouter>
      </ThemeProvider>,
    )

    await screen.findByRole('heading', { name: 'Settings' })
    let scene = document.querySelector('[data-theme-view="SettingsView"]')
    await waitFor(() => expect(scene).toBeInTheDocument())
    expect(within(scene).getByRole('heading', { name: 'Appearance' })).toBeInTheDocument()
    expect(within(scene).getAllByRole('radio')).toHaveLength(3)
    expect(within(scene).getAllByRole('img', { name: /preview/i })).toHaveLength(3)
    fireEvent.click(within(scene).getByRole('radio', { name: /Mission Workshop/ }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'mission-workshop')
    await waitFor(() => expect(screen.getByRole('radio', { name: /Mission Workshop/ })).toBeChecked())
    await waitFor(() => expect(document.querySelector('[data-theme-view="SettingsView"]')).toBeInTheDocument())
    scene = document.querySelector('[data-theme-view="SettingsView"]')
    for (const category of ['Learning', 'AI connection', 'Data & privacy', 'Restore']) {
      expect(within(scene).getByRole('button', { name: category })).toBeInTheDocument()
    }

    fireEvent.click(within(scene).getByRole('button', { name: 'Restore' }))
    expect(within(scene).getByRole('heading', { name: 'Restore learning data' })).toBeInTheDocument()
    expect(within(scene).queryByRole('heading', { name: 'Appearance' })).not.toBeInTheDocument()
  })
})
