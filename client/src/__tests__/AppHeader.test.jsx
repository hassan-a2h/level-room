import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'

describe('AppHeader', () => {
  it('marks the current destination and shows an available review count', () => {
    render(<MemoryRouter initialEntries={['/reviews']}><AppHeader dueCount={3} /></MemoryRouter>)
    const desktop = within(screen.getByRole('navigation', { name: 'Primary navigation' }))
    expect(desktop.getByRole('link', { name: 'Reviews, 3 due' })).toHaveAttribute('aria-current', 'page')
    expect(desktop.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  })

  it('omits a review badge when a count is unavailable', () => {
    render(<MemoryRouter><AppHeader /></MemoryRouter>)
    expect(screen.getAllByRole('link', { name: 'Reviews' })).toHaveLength(1)
    expect(screen.queryByText(/due/)).not.toBeInTheDocument()
  })

  it('omits the review badge when there is nothing due', () => {
    render(<MemoryRouter><AppHeader dueCount={0} /></MemoryRouter>)
    expect(screen.getAllByRole('link', { name: 'Reviews' })).toHaveLength(1)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('opens and closes the compact navigation accessibly', () => {
    render(<MemoryRouter><AppHeader /></MemoryRouter>)
    const toggle = screen.getByRole('button', { name: 'Open Trail switcher' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('group', { name: 'Trail switcher options' })).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(toggle)
  })

  it('renders a focused route header with a clear return link', () => {
    render(<MemoryRouter><AppHeader variant="focus" title="Linux permissions" returnTo="/" returnLabel="Dashboard" /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Linux permissions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toHaveAttribute('href', '/')
  })

  it.each(['https://outside.example', '//outside.example', 'javascript:alert(1)', '/\\outside.example'])('rejects unsafe focus return target %s', (returnTo) => {
    render(<MemoryRouter><AppHeader variant="focus" title="Session" progress="3 of 6" returnTo={returnTo} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toHaveAttribute('href', '/')
    expect(screen.getByText('3 of 6')).toBeInTheDocument()
  })

  it('preserves an internal focus return target', () => {
    render(<MemoryRouter><AppHeader variant="focus" title="Session" returnTo="/reviews" returnLabel="Review Queue" /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Back to Review Queue' })).toHaveAttribute('href', '/reviews')
  })
})
