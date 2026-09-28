import { Suspense } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider, useThemeView } from '../theme/ThemeProvider.jsx'
import SceneSkeleton from '../theme/core/SceneSkeleton.jsx'

function Trail() {
  const View = useThemeView('TrailView')
  return <Suspense fallback={<SceneSkeleton />}><View model={{ state: 'ready' }} /></Suspense>
}

describe('useThemeView', () => {
  it('loads the active pack view behind the stable scene skeleton', async () => {
    render(<ThemeProvider><Trail /></ThemeProvider>)
    expect(screen.getByRole('status', { name: 'Loading view…' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Trail' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('data-theme-view', 'TrailView')
  })
})
