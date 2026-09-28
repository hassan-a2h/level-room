import { Suspense } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CuriositySupport from '../../theme/packs/curiosity-engine/views/SupportView.jsx'
import WorkshopSupport from '../../theme/packs/mission-workshop/views/SupportView.jsx'
import AtlasSupport from '../../theme/packs/living-atlas/views/SupportView.jsx'
import SupportPage from '../../pages/SupportPage.jsx'
import { ThemeProvider } from '../../theme/ThemeProvider.jsx'

const views = [CuriositySupport, WorkshopSupport, AtlasSupport]

describe('support theme parity', () => {
  it.each(views)('shows the same safe error state and recovery action in %s', (View) => {
    const retry = vi.fn()
    render(<View model={{
      kind: 'offline', title: 'Learning service unavailable', message: 'Try connecting again.',
      detail: null, retryable: true, returnLabel: 'Return to your Trail',
    }} actions={{ retry }} />)

    const scene = screen.getByRole('main')
    expect(scene).toHaveAttribute('data-theme-view', 'SupportView')
    expect(within(scene).getByRole('heading', { name: 'Learning service unavailable' })).toBeInTheDocument()
    expect(within(scene).getByText('Try connecting again.')).toBeInTheDocument()
    fireEvent.click(within(scene).getByRole('button', { name: /try again/i }))
    expect(retry).toHaveBeenCalledOnce()
    expect(within(scene).getByRole('link', { name: 'Return to your Trail' })).toHaveAttribute('href', '/')
  })

  it('sanitizes route state before showing its recovery message', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/support?kind=server&message=SQLITE_ERROR%3A%20private%20table']}>
          <Suspense fallback={<div role="status">Loading support…</div>}><SupportPage /></Suspense>
        </MemoryRouter>
      </ThemeProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'Learning service needs a moment' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/could not complete that request/i)
    expect(screen.queryByText(/SQLITE_ERROR|private table/i)).not.toBeInTheDocument()
  })
})
