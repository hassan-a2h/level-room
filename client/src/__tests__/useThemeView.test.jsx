import { Suspense } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider, useThemeView } from '../theme/ThemeProvider.jsx'
import SceneSkeleton from '../theme/core/SceneSkeleton.jsx'
import { buildTrailViewModel } from '../features/trail/controller.js'

function Trail() {
  const View = useThemeView('TrailView')
  return <Suspense fallback={<SceneSkeleton />}><View model={buildTrailViewModel({ state: 'empty' })} /></Suspense>
}

describe('useThemeView', () => {
  it('loads the active pack view behind the stable scene skeleton', async () => {
    render(<MemoryRouter><ThemeProvider><Trail /></ThemeProvider></MemoryRouter>)
    expect(screen.getByRole('status', { name: 'Loading view…' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Your learning Trail' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('data-theme-view', 'TrailView')
  })
})
